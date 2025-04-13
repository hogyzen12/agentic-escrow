const { BorshCoder } = require('@project-serum/anchor');
const bs58 = require('bs58');
const IDL = require('./idl.json'); // Adjust the path if necessary

// Get the Base58-encoded instruction data from command-line arguments
const instructionDataBase58 = process.argv[2];
const instructionData = bs58.decode(instructionDataBase58);

// Initialize the BorshCoder with the IDL
const coder = new BorshCoder(IDL);

try {
  // Decode the instruction data
  const decoded = coder.instruction.decode(instructionData);
  
  if (decoded) {
    console.log('Instruction:', decoded.name);
    // Handle BigInt values in the output
    console.log('Arguments:', JSON.stringify(decoded.data, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  } else {
    console.log('Failed to decode instruction data');
  }
} catch (error) {
  console.error('Error decoding instruction:', error);
}