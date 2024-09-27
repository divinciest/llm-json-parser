LLM JSON Parser
===============

LLM JSON Parser is a groundbreaking TypeScript library designed to parse and reconstruct even the most severely broken JSON data using a predefined schema. This library pushes the limits of what is possible in JSON parsing, capable of extracting meaningful data from severely damaged JSON strings that would be unreadable by conventional parsers.

Motivation
----------

The main motivation for creating the LLM JSON Parser is to solve the frequent issue where large language models (LLMs) produce broken JSON outputs. In many cases, reprocessing the request is required, wasting time and resources. This parser allows for recovering valuable data without needing to rerun the entire process.

Features
--------

*   **Extreme Resilience**: Parses JSON that is extremely broken, extracting all possible values with high accuracy.
*   **Multiple Parse Results**: Returns all possible parse results, sorted by the likelihood of correctness.
*   **Schema-Guided Reconstruction**: Uses a provided schema (with values as strings like "string", "number", etc.) to intelligently reconstruct broken JSON, even from fragments.
*   **Flexible Input**: Accepts JSON in virtually any condition, from minor syntax errors to severely shattered structures.
*   **Type-Safe Output**: Reconstructs JSON data according to the schema, ensuring type consistency even with ambiguous input.
*   **Heuristic Parsing**: Uses advanced heuristics to make educated guesses about data structure and types when dealing with incomplete or missing information.
*   **Detailed Parsing Reports**: Provides comprehensive reports on the parsing process, including confidence levels for each parsed element.

Quick Start
-----------

To install the LLM JSON Parser, run the following command:

    npm install llm-json-parser

You can start with this example:

    
    import { parseJSON } from './llm-json-parser';
    
    const extremelyBrokenJSON = `
      name John Doe
      age: 30  picoupicou
      email john@example.com
      hobbies: [reading cycling
      }
    `;
    
    const schema = {
      name: "string",
      age: "number",
      email: "string",
      hobbies: ["string"]
    };
    
    const results = parseJSON(extremelyBrokenJSON, schema);
    console.log(results);
        

API Reference
-------------

### parseJSON(jsonString: string, schema: object, options?: ParserOptions): ParseResult\[\]

Parses an extremely broken JSON string using the provided schema and returns multiple possible interpretations.

*   **jsonString**: The broken JSON string to parse.
*   **schema**: An object describing the expected structure, where values are strings such as "string", "number", "boolean", etc.
*   **options**: (Optional) Configuration options for the parser.

Returns an array of `ParseResult` objects, each containing a possible interpretation and a confidence score.

### ParserOptions

An object with the following properties:

*   **caseInsensitive**: (Default: `true`) Enables case-insensitive matching for property names.
*   **bestMatchAttribute**: (Default: `true`) Attempts to match attributes based on best approximation.

Advanced Usage
--------------

For scenarios where the JSON is almost unrecognizable, the parser still manages to extract relevant data. Here’s an example:

    
    import { parseJSON } from './llm-json-parser';
    
    const shatteredJSON = `
      {
        "user": [
          "Alice Smith",
          28,
          {
            "email": [
              "alice@example.com",
            ] ,
            "phone": "555-1234"
          }
        ],
        "orders": [
          [1, "Laptop"],
          [2, "Mouse and Keyboard"]
        ]
      }
    `;
    
    const complexSchema = {
      user: {
        name: "string",
        age: "number",
        contact: {
          email: "string",
          phone: "string"
        }
      },
      orders: [{
        id: "number",
        product: "string"
      }]
    };
    
    const results = parseJSON(shatteredJSON, complexSchema);
    console.log(results);
        

Error Handling
--------------

Even with broken JSON, LLM JSON Parser will try to extract as much data as possible. Here's how to handle potential errors:

    
    try {
      const results = parseJSON(shatteredJSON, schema);
      results.forEach((result, index) => {
        console.log(`Parse result ${index + 1} (Confidence: ${result.confidence}):`);
        console.log(result.data);
      });
    } catch (error) {
      console.error('Parsing failed:', error.message);
      // Handle the error appropriately
    }
        

Handling Misplaced Data
-----------------------

LLM JSON Parser can also detect and recover values that don't adhere to the provided schema, which is particularly useful when large language models (LLMs) hallucinate and embed data under labels you didn't ask for.

For example, if the LLM places an `email` field under `contact.email` instead of directly under the root as specified in the schema, the parser can intelligently recover the data and map it to the correct location.

Using heuristic-based matching and schema-guided reconstruction, LLM JSON Parser ensures that misplaced values are placed where they should be according to the intended schema.

Contributing
------------

Contributions are welcome! Follow these steps to contribute:

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

License
-------

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Support
-------

If you encounter any issues or have questions, please file an issue on the GitHub repository.