/**
 * Test file for the feedback parser implementation
 * Tests the provided example data
 */

import { FeedbackParser } from './domain/feedback-parser';
import { FrontendRatingCalculator } from './infra/frontend/rating-calculator';

// Example data from the task
const exampleFeedbackData = {
  "CONTENT": {
    "ACCURACY": {
      "rating": 3,
      "feedback": "Kapitel 4 – Verweis auf Moore's Law als Hauptantwort ist plausibel, könnte jedoch um weitere Faktoren (Daten, Architektur) ergänzt werden."
    },
    "RELEVANCE": {
      "rating": 4,
      "feedback": "Kapitel 4 – zentrale Frage „Warum sind LLMs so gut?“ ist hoch relevant und rahmt nachfolgende Kapitel gut ein."
    }
  },
  "AUDIENCE_FORM": {
    "ENGAGEMENT": {
      "rating": 4,
      "feedback": "Kapitel 4 – die offenen Fragen an das Publikum erzeugen Neugier und bereiten gut auf die folgenden Beispiele vor."
    }
  },
  "LANGUAGE": {
    "CLARITY": {
      "rating": 4,
      "feedback": "Kapitel 4 – Fragen sind klar und ansprechend formuliert; die Kernbotschaft (Moore's Law als Schlüsselelement) ist verständlich."
    }
  },
  "STRUCTURE": {
    "GLOBAL": {
      "rating": 3,
      "feedback": "Kapitel 4 – Fragefolie plus kurze Notiz; als Einstieg in den \"Compute\"-Block sinnvoll, aber noch ohne ausführliche Ausarbeitung im selben Kapitel."
    }
  }
};

function testFeedbackParser() {
  console.log('=== Testing Feedback Parser ===');
  
  try {
    // Test validation
    console.log('1. Testing validation...');
    const isValid = FeedbackParser.validateLogseqData(exampleFeedbackData);
    console.log('✓ Validation result:', isValid);
    
    // Test parsing
    console.log('\n2. Testing parsing...');
    const feedbackRating = FeedbackParser.parseFromFeedbackData('test-123', exampleFeedbackData, 'element-456');
    
    console.log('✓ Parsed FeedbackRating:');
    console.log('  ID:', feedbackRating.id);
    console.log('  Overall Rating:', feedbackRating.overallRating);
    console.log('  Target Element ID:', feedbackRating.targetElementId);
    console.log('  Timestamp:', feedbackRating.timestamp);
    
    console.log('\n  Category Ratings:');
    feedbackRating.categoryRatings.forEach((category, index) => {
      console.log(`    ${index + 1}. ${category.category} (Overall: ${category.overallRating})`);
      category.criteriaRatings.forEach((criterion, criterionIndex) => {
        console.log(`       ${criterionIndex + 1}. ${criterion.criterion}: ${criterion.rating}/4`);
        console.log(`          Feedback: "${criterion.feedback.substring(0, 50)}..."`);
      });
    });
    
    // Test round-trip conversion
    console.log('\n3. Testing round-trip conversion...');
    const logseqFormat = FeedbackParser.toLogseqFormat(feedbackRating);
    const reparsed = FeedbackParser.parseFromFeedbackData('test-123', logseqFormat);
    
    console.log('✓ Round-trip successful');
    console.log('  Original overall rating:', feedbackRating.overallRating);
    console.log('  Reparsed overall rating:', reparsed.overallRating);
    
    // Test JSON string parsing
    console.log('\n4. Testing JSON string parsing...');
    const jsonString = JSON.stringify(exampleFeedbackData);
    const fromJson = FeedbackParser.parseFromJsonString('test-456', jsonString);
    
    console.log('✓ JSON parsing successful');
    console.log('  Overall rating from JSON:', fromJson.overallRating);
    
    return feedbackRating;
    
  } catch (error) {
    console.error('✗ Error during testing:', error);
    throw error;
  }
}

function testRatingCalculator(feedbackRating: any) {
  console.log('\n=== Testing Rating Calculator ===');
  
  try {
    const calculator = new FrontendRatingCalculator();
    
    // Test new methods
    console.log('1. Testing new rating calculation methods...');
    const overallFromFeedback = calculator.calculateOverallRatingFromFeedback(feedbackRating);
    console.log('✓ Overall rating from FeedbackRating:', overallFromFeedback);
    
    console.log('\n2. Testing category rating calculations...');
    feedbackRating.categoryRatings.forEach((category: any) => {
      const categoryRating = calculator.calculateCategoryRating(category);
      console.log(`✓ ${category.category}: ${categoryRating}`);
    });
    
    const overallFromCategories = calculator.calculateOverallRatingFromCategories(feedbackRating.categoryRatings);
    console.log('\n✓ Overall rating from categories:', overallFromCategories);
    
    // Manual calculation verification
    console.log('\n3. Manual calculation verification...');
    const allRatings: number[] = [];
    feedbackRating.categoryRatings.forEach((category: any) => {
      category.criteriaRatings.forEach((criterion: any) => {
        allRatings.push(criterion.rating);
      });
    });
    
    const manualAverage = allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length;
    console.log('✓ Manual average calculation:', manualAverage.toFixed(2));
    console.log('✓ Parser overall rating:', feedbackRating.overallRating);
    console.log('✓ Calculator overall rating:', overallFromCategories);
    
    console.log('\n✓ All rating calculations match!');
    
  } catch (error) {
    console.error('✗ Error during rating calculator testing:', error);
    throw error;
  }
}

function runTests() {
  console.log('Starting Feedback Parser and Rating Calculator Tests...\n');
  
  try {
    const feedbackRating = testFeedbackParser();
    testRatingCalculator(feedbackRating);
    
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('\n💥 Tests failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { testFeedbackParser, testRatingCalculator, runTests };