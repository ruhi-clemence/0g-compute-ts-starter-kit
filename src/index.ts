import { ethers } from "ethers";
import { createZGComputeNetworkBroker, ZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

// Global variables
let wallet: ethers.Wallet;
let broker: ZGComputeNetworkBroker;

// Map of short flags to their long versions
const shortToLong: Record<string, string> = {
  'k': 'privateKey',
  'l': 'ls',
  'd': 'depositFee',
  'a': 'addLedger',
  'b': 'balance',
  's': 'settleFee',
  'p': 'provider',
  'q': 'query',
  'f': 'fallbackFee',
  'h': 'help'
};

// Parse command line arguments - supporting both short and long formats
function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      // Long format (--flag)
      const flag = args[i].substring(2);
      
      // If next arg doesn't start with dash, it's a value
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[flag] = args[i + 1];
        i++; // Skip the value in next iteration
      } else {
        // Flag without value
        flags[flag] = 'true';
      }
    } else if (args[i].startsWith('-')) {
      // Short format (-f)
      const shortFlag = args[i].substring(1);
      const longFlag = shortToLong[shortFlag] || shortFlag;
      
      // If next arg doesn't start with dash, it's a value
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[longFlag] = args[i + 1];
        i++; // Skip the value in next iteration
      } else {
        // Flag without value
        flags[longFlag] = 'true';
      }
    }
  }

  return flags;
}

// Initialize wallet and broker
async function initializeWalletAndBroker(privateKey: string): Promise<void> {
  try {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    
    console.log("Using private key (first few chars):", privateKey.substring(0, 6) + "...");
    wallet = new ethers.Wallet(privateKey, provider);
    console.log("Wallet address:", wallet.address);
    
    console.log("Initializing broker...");
    broker = await createZGComputeNetworkBroker(wallet);
    console.log("Broker initialized successfully");
    
    return;
  } catch (error: any) {
    console.error("Error initializing wallet and broker:", error.message);
    throw error;
  }
}

// Function to deposit funds
async function depositFunds(amount: number): Promise<void> {
  try {
    console.log(`Depositing ${amount} ETH...`);
    await broker.ledger.depositFund(amount);
    console.log("Deposit successful.");
    
    // Show updated balance
    await checkBalance();
  } catch (error: any) {
    console.error("Error depositing funds:", error.message);
  }
}

// Function to add funds to ledger
async function addFundsToLedger(amount: number): Promise<void> {
  try {
    console.log(`Adding ${amount} to ledger...`);
    await broker.ledger.addLedger(amount);
    console.log("Funds added successfully.");
    
    // Show updated balance
    await checkBalance();
  } catch (error: any) {
    console.error("Error adding funds to ledger:", error.message);
  }
}

// Function to check balance
async function checkBalance(): Promise<void> {
  try {
    const balance = await broker.ledger.getLedger();
    console.log("Current balance:", balance);
  } catch (error: any) {
    console.error("Error checking balance:", error.message);
  }
}

// Function to list available services
async function listServices(): Promise<void> {
  try {
    console.log("\nListing available services...");
    const services = await broker.inference.listService();
    
    console.log("\nFound", services.length, "services:");
    services.forEach((service: any, index: number) => {
      console.log(`\n[${index + 1}] Service Details:`);
      console.log(`- Model: ${service.model}`);
      console.log(`- Provider: ${service.provider}`);
      console.log(`- Type: ${service.serviceType}`);
      console.log(`- URL: ${service.url}`);
    });
    
    return;
  } catch (error: any) {
    console.error("Error listing services:", error.message);
  }
}

// Function to settle fee manually
async function settleFeeManually(providerAddress: string, fee: number): Promise<void> {
  console.log(`Settling fee of ${fee} for provider ${providerAddress}...`);
  try {
    await broker.inference.settleFee(providerAddress, fee);
    console.log("Fee settled successfully");
  } catch (error: any) {
    console.error("Error settling fee:", error.message);
  }
}

// Function to send a query to a service
async function sendQuery(providerAddress: string, query: string, fallbackFee?: number): Promise<void> {
  try {
    console.log(`Sending query to provider ${providerAddress}...`);
    
    // Get the service metadata
    console.log("Getting service metadata...");
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    console.log("Endpoint:", endpoint);
    console.log("Model:", model);
    
    // Get headers for authentication
    console.log("Getting request headers...");
    const headers = await broker.inference.getRequestHeaders(providerAddress, query);
    console.log("Request headers obtained");
    
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
    
    console.log("\nSending request to AI service...");
    
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
    console.log("\nResponse from AI:");
    console.log(content);
    
    // Process payment
    const chatId = completion.id;
    try {
      console.log("\nProcessing response payment...");
      const isValid = await broker.inference.processResponse(
        providerAddress,
        content || "",
        chatId
      );
      console.log(`Response validity: ${isValid ? "Valid" : "Invalid"}`);
    } catch (error: any) {
      console.log("Error processing response:", error.message);
      if (fallbackFee && fallbackFee > 0) {
        console.log(`Using fallback fee of ${fallbackFee}...`);
        await settleFeeManually(providerAddress, fallbackFee);
      } else {
        console.log("No fallback fee specified. Payment may not have been processed.");
      }
    }
    
  } catch (error: any) {
    console.error("Error sending query:", error.message);
    if (error.response) {
      console.error("API Error status:", error.response.status);
      console.error("API Error data:", error.response.data);
    }
  }
}

// Show help message
function showHelp(): void {
  console.log(`
0G Compute Network CLI

Usage:
  node dist/index.js [options]

Options:
  -k, --privateKey [key]     Ethereum private key (or set in .env file)
  -l, --ls                   List available AI services
  -d, --depositFee [amount]  Deposit funds to your account
  -a, --addLedger [amount]   Add funds to your ledger
  -b, --balance              Check your current balance
  -s, --settleFee [amount]   Manually settle a fee
  -p, --provider [address]   Provider address for queries and settling fees
  -q, --query [text]         Query text to send to the model
  -f, --fallbackFee [amount] Fallback fee amount if processResponse fails
  -h, --help                 Show this help message

Examples:
  # List available services
  node dist/index.js -k YOUR_KEY -l
  
  # Deposit funds
  node dist/index.js -k YOUR_KEY -d 0.1
  
  # Query a model
  node dist/index.js -k YOUR_KEY -p 0x123... -q "Hello, AI!" -f 0.01
  
  # Check balance
  node dist/index.js -k YOUR_KEY -b
  
  # Manually settle a fee
  node dist/index.js -k YOUR_KEY -p 0x123... -s 0.01
  `);
}

// Main function
async function main() {
  try {
    const flags = parseArgs();
    
    // Show help if requested
    if (flags['help']) {
      showHelp();
      return;
    }
    
    // Get private key from args or env
    const privateKey = flags['privateKey'] || process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error("Private key is required. Use -k/--privateKey [key] or set PRIVATE_KEY in .env");
      process.exit(1);
    }

    // Initialize wallet and broker
    await initializeWalletAndBroker(privateKey);

    // List services
    if (flags['ls']) {
      await listServices();
      return;
    }

    // Deposit fee
    if (flags['depositFee']) {
      const amount = parseFloat(flags['depositFee']);
      if (!isNaN(amount) && amount > 0) {
        await depositFunds(amount);
      } else {
        console.error("Invalid deposit amount");
      }
      return;
    }

    // Check balance
    if (flags['balance']) {
      await checkBalance();
      return;
    }

    // Add ledger funds
    if (flags['addLedger']) {
      const amount = parseFloat(flags['addLedger']);
      if (!isNaN(amount) && amount > 0) {
        await addFundsToLedger(amount);
      } else {
        console.error("Invalid ledger amount");
      }
      return;
    }

    // Settle fee directly
    if (flags['settleFee']) {
      if (!flags['provider']) {
        console.error("Provider address is required with -p/--provider [address]");
        return;
      }
      
      const fee = parseFloat(flags['settleFee']);
      if (!isNaN(fee) && fee > 0) {
        await settleFeeManually(flags['provider'], fee);
      } else {
        console.error("Invalid fee amount");
      }
      return;
    }

    // Send query to service
    if (flags['query']) {
      if (!flags['provider']) {
        console.error("Provider address is required with -p/--provider [address]");
        return;
      }
      
      let fallbackFee = undefined;
      if (flags['fallbackFee']) {
        fallbackFee = parseFloat(flags['fallbackFee']);
        if (isNaN(fallbackFee) || fallbackFee <= 0) {
          console.error("Invalid fallback fee amount");
          return;
        }
      }
      
      await sendQuery(flags['provider'], flags['query'], fallbackFee);
      return;
    }

    // If no operation flags provided, show help
    if (!Object.keys(flags).some(key => 
      ['ls', 'depositFee', 'balance', 'addLedger', 'settleFee', 'query'].includes(key))) {
      console.log("No operation specified.");
      showHelp();
    }

  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Start the application
main(); 