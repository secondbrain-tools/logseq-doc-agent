/**
 * Test for the getBlockText function
 */

// This is a simple test to demonstrate the expected behavior of getBlockText
// In a real Logseq environment, you would use actual block UUIDs

// Example of what the function should do:
const sampleBlockContent = `
This is a line of content
author:: John Doe
status:: active

This is another line
created:: 2023-01-01
Final line of content
`;

// Expected output after filtering:
const expectedFilteredContent = `This is a line of content
This is another line
Final line of content`;

// Simulate the filtering logic from getBlockText
function simulateGetBlockText(content: string): string {
  // Split content into lines
  const lines = content.split('\n');
  
  // Filter out empty lines and property lines (key:: value)
  const filteredLines = lines.filter((line: string) => {
    const trimmedLine = line.trim();
    // Skip empty lines
    if (trimmedLine === '') {
      return false;
    }
    // Skip property lines (key:: value pattern)
    if (/^[^:]+::\s*.+$/.test(trimmedLine)) {
      return false;
    }
    return true;
  });

  // Join the filtered lines back together
  return filteredLines.join('\n');
}

// Test the function
const result = simulateGetBlockText(sampleBlockContent);
console.log('Original content:');
console.log(sampleBlockContent);
console.log('\nFiltered content:');
console.log(result);
console.log('\nExpected content:');
console.log(expectedFilteredContent);
console.log('\nTest passed:', result === expectedFilteredContent);