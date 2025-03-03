import { ethers } from "ethers";
import { createZGComputeNetworkBroker, ZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

class BrokerService {
  private wallet: ethers.Wallet | null = null;
  private broker: ZGComputeNetworkBroker | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize immediately
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('PRIVATE_KEY is required in .env file');
      }
      
      const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
      this.wallet = new ethers.Wallet(privateKey, provider);
      this.broker = await createZGComputeNetworkBroker(this.wallet);
      this.initialized = true;
      console.log("Broker service initialized successfully with wallet:", this.wallet.address);
    } catch (error: any) {
      console.error("Failed to initialize broker service:", error.message);
      throw error;
    }
  }

  /**
   * Ensures broker is initialized before any operation
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initPromise) {
      await this.initPromise;
    }
    
    if (!this.broker || !this.wallet) {
      throw new Error("Broker service not properly initialized");
    }
  }

  /**
   * Deposit funds to account
   * @param amount Amount to deposit in ETH
   */
  async depositFunds(amount: number): Promise<string> {
    await this.ensureInitialized();
    
    try {
      await this.broker!.ledger.depositFund(amount);
      return "Deposit successful";
    } catch (error: any) {
      throw new Error(`Failed to deposit funds: ${error.message}`);
    }
  }

  /**
   * Add funds to ledger
   * @param amount Amount to add
   */
  async addFundsToLedger(amount: number): Promise<string> {
    await this.ensureInitialized();
    
    try {
      await this.broker!.ledger.addLedger(amount);
      return "Funds added to ledger successfully";
    } catch (error: any) {
      throw new Error(`Failed to add funds to ledger: ${error.message}`);
    }
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<any> {
    await this.ensureInitialized();
    
    try {
      const balanceInfo = await this.broker!.ledger.getLedger();
      return balanceInfo;
    } catch (error: any) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * List available services
   */
  async listServices(): Promise<any[]> {
    await this.ensureInitialized();
    
    try {
      const services = await this.broker!.inference.listService();
      return services;
    } catch (error: any) {
      throw new Error(`Failed to list services: ${error.message}`);
    }
  }

  /**
   * Manually settle a fee
   * @param providerAddress Provider address
   * @param fee Fee amount
   */
  async settleFee(providerAddress: string, fee: number): Promise<string> {
    await this.ensureInitialized();
    
    try {
      await this.broker!.inference.settleFee(providerAddress, fee);
      return "Fee settled successfully";
    } catch (error: any) {
      throw new Error(`Failed to settle fee: ${error.message}`);
    }
  }

  /**
   * Send a query to an AI service
   * @param providerAddress Provider address
   * @param query Query text
   * @param fallbackFee Optional fallback fee
   */
  async sendQuery(providerAddress: string, query: string, fallbackFee?: number): Promise<any> {
    await this.ensureInitialized();
    
    try {
      // Get the service metadata
      const { endpoint, model } = await this.broker!.inference.getServiceMetadata(providerAddress);
      
      // Get headers for authentication
      const headers = await this.broker!.inference.getRequestHeaders(providerAddress, query);
      
      // Create OpenAI client with the service URL
      const openai = new OpenAI({
        baseURL: endpoint,
        apiKey: "", // Empty string as per docs
      });
      
      // Prepare headers in the format OpenAI client expects
      const requestHeaders: Record<string, string> = {};
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          requestHeaders[key] = value;
        }
      });
      
      // Make the API request
      const completion = await openai.chat.completions.create(
        {
          messages: [{ role: "user", content: query }],
          model, // Use the model from metadata
        },
        {
          headers: requestHeaders,
        }
      );
      
      // Process response
      const content = completion.choices[0].message.content;
      const chatId = completion.id;
      
      // Process payment
      try {
        const isValid = await this.broker!.inference.processResponse(
          providerAddress,
          content || "",
          chatId
        );
        
        return {
          content,
          metadata: {
            model,
            isValid,
            provider: providerAddress,
          }
        };
      } catch (error: any) {
        // Use fallback fee if provided
        if (fallbackFee && fallbackFee > 0) {
          await this.settleFee(providerAddress, fallbackFee);
          
          return {
            content,
            metadata: {
              model,
              usedFallbackFee: true,
              fallbackFeeAmount: fallbackFee,
              provider: providerAddress,
            }
          };
        } else {
          throw new Error(`Payment processing failed: ${error.message}`);
        }
      }
    } catch (error: any) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }
}

// Singleton instance
export const brokerService = new BrokerService(); 