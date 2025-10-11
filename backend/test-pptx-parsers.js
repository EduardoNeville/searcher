const fs = require('fs');
const path = require('path');

// Test all available PPTX parsers
async function testParsers(pptxFilePath) {
  console.log('\n=== Testing PPTX Parsers ===\n');
  console.log(`File: ${pptxFilePath}\n`);

  if (!fs.existsSync(pptxFilePath)) {
    console.error('Error: PPTX file not found!');
    console.log('Please provide a path to a .pptx file as the first argument.');
    console.log('Example: node test-pptx-parsers.js /path/to/presentation.pptx');
    process.exit(1);
  }

  const buffer = fs.readFileSync(pptxFilePath);

  // Test 1: nodejs-pptx (the one you just installed)
  console.log('1. Testing nodejs-pptx...');
  try {
    const nodejsPptx = require('nodejs-pptx');
    const text = await nodejsPptx.parsePPTX(pptxFilePath);
    console.log('✓ SUCCESS - nodejs-pptx');
    console.log(`Extracted text (first 200 chars): ${text.substring(0, 200)}...`);
    console.log(`Total length: ${text.length} characters\n`);
  } catch (error) {
    console.log(`✗ FAILED - nodejs-pptx: ${error.message}\n`);
  }

  // Test 2: node-pptx (currently in your code)
  console.log('2. Testing node-pptx...');
  try {
    const NodePPTX = require('node-pptx');
    const tempFile = `/tmp/test_${Date.now()}.pptx`;
    fs.writeFileSync(tempFile, buffer);

    const presentation = new NodePPTX(tempFile);
    const slides = presentation.getSlides();
    let allText = [];

    for (const slide of slides) {
      const slideText = slide.getText();
      if (slideText) {
        allText.push(slideText);
      }
    }

    const fullText = allText.join('\n\n');
    fs.unlinkSync(tempFile);

    console.log('✓ SUCCESS - node-pptx');
    console.log(`Extracted text (first 200 chars): ${fullText.substring(0, 200)}...`);
    console.log(`Total length: ${fullText.length} characters\n`);
  } catch (error) {
    console.log(`✗ FAILED - node-pptx: ${error.message}\n`);
  }

  // Test 3: node-pptx-parser
  console.log('3. Testing node-pptx-parser...');
  try {
    const pptxParser = require('node-pptx-parser');
    const text = await pptxParser.extractText(pptxFilePath);
    console.log('✓ SUCCESS - node-pptx-parser');
    console.log(`Extracted text (first 200 chars): ${text.substring(0, 200)}...`);
    console.log(`Total length: ${text.length} characters\n`);
  } catch (error) {
    console.log(`✗ FAILED - node-pptx-parser: ${error.message}\n`);
  }

  // Test 4: Manual extraction (your fallback method)
  console.log('4. Testing manual extraction (yauzl + xml2js)...');
  try {
    const DocumentProcessor = require('./documentProcessor');
    const processor = new DocumentProcessor();
    const text = await processor.extractPptxManual(buffer);
    console.log('✓ SUCCESS - Manual extraction');
    console.log(`Extracted text (first 200 chars): ${text.substring(0, 200)}...`);
    console.log(`Total length: ${text.length} characters\n`);
  } catch (error) {
    console.log(`✗ FAILED - Manual extraction: ${error.message}\n`);
  }

  console.log('=== Test Complete ===\n');
}

// Get PPTX file path from command line
const pptxFile = process.argv[2];

if (!pptxFile) {
  console.error('Error: Please provide a PPTX file path');
  console.log('Usage: node test-pptx-parsers.js /path/to/file.pptx');
  process.exit(1);
}

testParsers(pptxFile).catch(console.error);
