# 0G Compute TypeScript SDK Starter Kit

This repository demonstrates how to integrate and use the 0G Compute TypeScript SDK in your applications. It provides implementation examples for interacting with decentralized AI services on the 0G Compute Network.

## Repository Branches

### Main Branch (Current)
REST API implementation using Express framework with Swagger documentation.
```bash
git checkout main
```

- Features:
  - RESTful endpoints for AI services
  - Swagger UI for API testing and documentation
  - TypeScript implementation for type safety
  - Automatic ledger initialization at startup

### CLI Branch
CLI implementation using Node.js and Commander.
```bash
git checkout cli-version
```

- Features:
  - CLI implementation for AI services
  - TypeScript implementation for type safety
  - Automatic ledger initialization at startup


## SDK Implementation (Main Branch)

### Broker Setup
```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Create broker instance
const broker = await createZGComputeNetworkBroker(wallet);
```

### Service Operations

#### Account Management
```typescript
// Deposit funds
const depositResult = await broker.ledger.depositFund(0.1);

// Check balance
const balance = await broker.ledger.getLedger();
```

#### Service Discovery and Querying
```typescript
// List available services
const services = await broker.inference.listService();

// Get service metadata
const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

// Get authentication headers
const headers = await broker.inference.getRequestHeaders(providerAddress, queryText);

// Create OpenAI client
const openai = new OpenAI({
  baseURL: endpoint,
  apiKey: "", // Empty string as per docs
});

// Send query to AI service
const completion = await openai.chat.completions.create(
  {
    messages: [{ role: "user", content: queryText }],
    model,
  },
  {
    headers: headers,
  }
);

// Process payment
const isValid = await broker.inference.processResponse(
  providerAddress,
  completion.choices[0].message.content || "",
  completion.id
);

// Fallback: Manually settle fee if needed
await broker.inference.settleFee(providerAddress, fallbackFee);
```

## Workflow Description

#### What happens during query processing:
1. Service metadata is retrieved to get the endpoint and model
2. Authentication headers are generated to secure the request
3. The query is sent to the AI service endpoint
4. The response is processed for verification. This step handles the payment processing.
5. If payment processing fails, fallback fee settlement is attempted
6. The query result is returned to the client

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/0g-compute-starter-kit.git
```

2. Navigate to the project directory:
```bash
cd 0g-compute-starter-kit
```

3. Install dependencies:
```bash
npm install
```

4. Copy the .env.example file to .env and set your private key:
```bash
cp .env.example .env
```

Update the `.env` file with your Ethereum private key (without the `0x` prefix):
```
PRIVATE_KEY=your_private_key_here
PORT=4000
NODE_ENV=development
```

5. Build the project:
```bash
npm run build
```

6. Start the server:
```bash
npm start
```

7. Access Swagger UI: http://localhost:4000/docs

## Application Initialization

When the application starts, it automatically:
1. Checks if a ledger account exists for the configured wallet
2. If no ledger exists, it automatically creates one with an initial amount (0.01 ETH by default)
3. Logs the initialization status to the console

Refer to the `src/startup.ts` file for the implementation details.
This ensures that the application is always ready to use without manual setup.

## API Endpoints

The API server includes the following endpoints:

### Account Endpoints
- `POST /api/account/deposit` - Deposit funds
  - Request: `{ "amount": 0.1 }`
  - Response: Success message with deposit confirmation

- `GET /api/account/info` - Get account information
  - Response: Current account details including ledger balance

### Service Endpoints
- `GET /api/services/list` - List available AI services
  - Response: Array of available services with provider addresses and models

- `POST /api/services/query` - Send a query to an AI service
  - Request: `{ "providerAddress": "0x123...", "query": "Hello, AI!", "fallbackFee": 0.01 }`
  - Response: AI response with metadata

- `POST /api/services/settle-fee` - Manually settle a fee, only if the fee is not settled when the query is sent
  - Request: `{ "providerAddress": "0x123...", "fee": 0.01 }`
  - Response: Success message with settlement confirmation

## Network Configuration

The application uses the following default network configuration:

```typescript
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
```

This can be overridden through environment variables if needed.

## Best Practices

1. **Error Handling**:
   - Implement try-catch blocks for all broker operations
   - Include fallback fee mechanism for payment failures
   - Validate inputs before sending to the network

2. **Security**:
   - Store private keys securely in environment variables
   - Never expose private keys in code or logs
   - Implement proper validation for user inputs

3. **Resource Management**:
   - Close connections properly
   - Use appropriate timeout values
   - Implement rate limiting for production deployments

4. **Payment Processing**:
   - Always handle nonce errors with fallback fee mechanism
   - Verify successful payment processing
   - Implement proper balance checking before operations

## Common Error Handling

### Unsettled Previous Fee Error

If you encounter an error like the following:
```
Error: invalid previousOutputFee: expected 0.00000000000000015900000000000001138, got 0
```

This indicates that a previous fee hasn't been settled properly. To resolve this:

1. Copy the exact fee amount from the error message (in this example: `0.00000000000000015900000000000001138`)
2. Use the `/api/services/settle-fee` endpoint with the exact fee amount:
   ```json
   {
     "providerAddress": "0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3",
     "fee": 0.00000000000000015900000000000001138
   }
   ```
3. Once the fee is settled, your original query should succeed

### BigInt Serialization in Responses

The application handles the serialization of BigInt values in responses, which is particularly important for the account information and service listing endpoints. This prevents errors like:
```
Error: Do not know how to serialize a BigInt
```

### Wallet Initialization Errors

If you see errors related to wallet or broker initialization:
1. Ensure your `.env` file contains a valid `PRIVATE_KEY`
2. Check your network connection to the RPC endpoint
3. Verify that your wallet has sufficient testnet ETH for transactions

## Next Steps

Explore advanced SDK features in the [0G Compute Network documentation](https://docs.0g.ai/build-with-0g/compute-network).

Learn more about the [0G Compute Network](https://docs.0g.ai/).