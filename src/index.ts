// library doesnt support yet "2d arrays" of objects with deep attributes in which you cant formulate a unique path x.y.z[i] it supports arrays indexing only at last level and only if no ancestor array  
import * as _ from 'lodash';
import { createParser } from 'really-relaxed-json'

function safeStringify(obj,
    a1: any = null, a2: any = null
) {
    const cache = new WeakSet();
    return JSON.stringify(obj, function (key, value) {
        // Exclude functions and undefined values
        if (typeof value === "function" || value === undefined) {
            return;
        }
        if (typeof value === "object" && value !== null) {
            if (cache.has(value)) {
                return "[Circular]";
            }
            cache.add(value);
        }
        return value;
    });
}


function predictLinesAttributes(jsonString, schema, caseInsensitive = false, bestMatchAttribute = false) {
    const lines = jsonString.split('\n');
    const result: any[] = [];
    // unique set of attribute names
    const attributes = new Set();

    // Extract all possible attributes from schema
    const possibleAttributes = extractAttributesFromSchema(schema);
    // sort by length longest first
    function isPropertyName(line) {
        return /^\s*["'][^"']+["']\s*:/.test(line);
    }

    function extractPropertyName(line) {
        const match = line.match(/^\s*["']([^"']+)["']\s*:/);
        return match ? match[1] : null;
    }

    function findBestMatch(line, possibleAttributes, caseInsensitive) {
        const searchLine = caseInsensitive ? line.toLowerCase() : line;

        return possibleAttributes.find(attr => {
            const searchAttr = caseInsensitive ? attr.toLowerCase() : attr;
            const regex = new RegExp(`\\b${escapeRegExp(searchAttr)}\\b`);
            return regex.test(searchLine);
        });
    }

    // Helper function to escape special characters in regex
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    for (let line of lines) {
        line = line.trim();
        let attributeName = '';

        if (isPropertyName(line)) {
            attributeName = extractPropertyName(line);
        }

        if (!attributeName && bestMatchAttribute) {
            attributeName = findBestMatch(line, possibleAttributes, caseInsensitive) || '';
        }

        if (caseInsensitive) {
            attributeName = attributeName.toLowerCase();
        }

        attributes.add(attributeName);

        result.push([line, attributeName]);
    }
    // remove "" from attributes set

    if (attributes.has('')) {
        attributes.delete('');
    }

    return [result, Array.from(attributes)];
}

function extractAttributesFromSchema(schema) {
    const attributes: any[] = [];

    function traverse(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                attributes.push(key);
                traverse(obj[key]);
            } else {
                attributes.push(key);
            }
        }
    }

    traverse(schema);
    return [...new Set(attributes)]; // Remove duplicates
}

// Now this function should correctly manage all data types and maintain proper types in results.
function getAllPaths(schema, currentPath = '') {
    let paths: string[] = [];

    // Verify schema is an object and iterate over its keys
    if (typeof schema === 'object' && schema !== null) {
        Object.keys(schema).forEach(key => {
            // Construct the path for this key
            const newPath = currentPath ? `${currentPath}.${key}` : key;

            // Add every path, including those for objects
            paths.push(newPath);

            // Get the value at the current key in the schema
            const value = schema[key];

            // If the value is an object and not an array of primitives, recurse into it
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    if (value.length > 0 && typeof value[0] === 'object') {
                        // If it's an array of objects, recurse with the first object
                        paths = paths.concat(getAllPaths(value[0], newPath));
                    }
                } else {
                    // Recurse directly for non-array objects
                    paths = paths.concat(getAllPaths(value, newPath));
                }
            }
        });
    }

    return paths;
}


function mapObjectToSchemaCase(obj, schema) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    const result = Array.isArray(obj) ? [] : {};

    for (let schemaKey in schema) {
        const lowerSchemaKey = schemaKey.toLowerCase();
        const schemaValue = schema[schemaKey];

        for (let objKey in obj) {
            if (objKey.toLowerCase() === lowerSchemaKey) {
                const value = obj[objKey];

                if (Array.isArray(schemaValue)) {
                    // Handle array types
                    if (Array.isArray(value)) {
                        result[schemaKey] = value.map(item => mapObjectToSchemaCase(item, schemaValue[0]));
                    } else {
                        result[schemaKey] = value;
                    }
                } else if (typeof schemaValue === 'object' && schemaValue !== null) {
                    // Recursive call for nested objects
                    result[schemaKey] = mapObjectToSchemaCase(value, schemaValue);
                } else {
                    // Handle primitive types and strings
                    result[schemaKey] = value;
                }

                break;
            }
        }
    }

    return result;
}


function mapPathsToFullFamily(paths, schema) {
    let pathMap = new Map();

    paths.forEach(path => {
        // Initialize an array for storing related paths
        pathMap.set(path, []);

        // Find immediate children
        let children = paths.filter(p => p.startsWith(path + ".") && p.split('.').length === path.split('.').length + 1);
        pathMap.get(path).push(...children);

        // Find immediate siblings
        let parentPath = path.substring(0, path.lastIndexOf('.'));
        let siblings = paths.filter(p => p !== path && p.substring(0, p.lastIndexOf('.')) === parentPath);
        pathMap.get(path).push(...siblings);

        // Recursively find all siblings of each ancestor up to the root
        let currentParentPath = parentPath;
        while (currentParentPath) {
            let grandParentPath = currentParentPath.substring(0, currentParentPath.lastIndexOf('.'));
            let parentSiblings = paths.filter(p => p !== currentParentPath && p.substring(0, p.lastIndexOf('.')) === grandParentPath);
            pathMap.get(path).push(...parentSiblings);
            currentParentPath = grandParentPath; // Move up to the next level
        }
        // if this is in an array add self
        if (hasArrayAncestor(path, schema)) { // to do , this is the case if your immediate parent in insaide an array
            pathMap.get(path).push(path);
        }
    });

    return pathMap;
}


/**
 * Builds a mapping for every possible current dot-path + encountered attribute to all possible dot-path prediction choices.
 *
 * @param {Object} schema - The schema defining the structure.
 * @return {Object} The mapping of attribute paths to related paths.
 */
function buildPathPredictionsMapping(schema) {
    const allPaths = getAllPaths(schema); // Get all possible paths in the schema
    const pathMap = mapPathsToFullFamily(allPaths, schema); // Each path is mapped to its immediate 
    // children and siblings and all siblings of each ancestor up to the root
    // this is mapping of path -> relatedPaths is useful to know every time an attribute is encountered during parsing
    // what is the possible path it you be in at that point
    let attributeMap = new Map();

    let rootAttributeNames: string[] = []
    pathMap.forEach((relatedPaths, path) => { // For every path and its corresponding related paths
        if (!path.includes('.')) { // is this in root?
            rootAttributeNames.push(path)
        }
        // Get the attribute name from the current path
        let relatedAttributeNames = relatedPaths.map(p => [p.substring(p.lastIndexOf('.') + 1), p]); // All possible attributes one can encounter just before or just after the current path in json
        let mapAttributeToPath = {}
        for (const [attributeName, path_] of relatedAttributeNames) {
            if (mapAttributeToPath[attributeName]) {
                // mapAttributeToPath[attributeName] = [...mapAttributeToPath[attributeName], path_]
                mapAttributeToPath[attributeName].splice(mapAttributeToPath[attributeName].findIndex(p => (p.match(/\./g) || []).length > (path_.match(/\./g) || []).length) + 1, 0, path_);
            } else {
                mapAttributeToPath[attributeName] = [path_]
            }
        }
        // Store in the map
        attributeMap.set(path, mapAttributeToPath);
    });
    attributeMap.set('', Object.fromEntries(rootAttributeNames.map(name => [name, [name]])))

    return mapToObject(attributeMap);
}


function getSchemaAtPath(schema, path) {
    const parts = path.split('.');
    let current = schema;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    return current;
}

function getAncestorArrayPath(path, schema) {
    const parts = path.split('.');
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) currentPath += '.';
        currentPath += parts[i];
        let schemaAtPath = getSchemaAtPath(schema, currentPath);
        // LOG({ schemaAtPath, currentPath, constructorName: schemaAtPath?.constructor?.name });
        if (schemaAtPath === Array || schemaAtPath?.constructor?.name === 'Array') {
            return currentPath;
        } else {
            //  LOG(`Path ${currentPath} is of type ${typeof schemaAtPath}`);
        }
    }
    return "";
}




function prepareJson(jsonString) {// insert new line after every "{" , "}" ,"," , "[" , "]"
    jsonString = jsonString.replace(/([{}:,[])/g, "$1\n");
    // remove any number of white spaces between each " and next :
    // jsonString = jsonString.replace(/\s*:\s*/g, ":");
    // insert new line just before every string between quotes followed by : 
    // jsonString = jsonString.replace(/"([^"]+)"\s*:/g, '"$1"\n:');


    return jsonString;
}
// change function to to insert new line after every , or opening or closing bracket or curly brackets


function looseStringArrayParser(inputString, arrayName) {

    let primaryParserResult = primaryParser(inputString, arrayName);
    if (primaryParserResult) {
        if (!(Array.isArray(primaryParserResult) && primaryParserResult.length > 1
            && typeof primaryParserResult[0] === 'string') // it is not an array of strings
        ) {
            if (primaryParserResult?.toString) {
                primaryParserResult = [primaryParserResult.toString()]
            } else {
                primaryParserResult = null
            }
        }
    }
    if (primaryParserResult) {
        return primaryParserResult
    }
    // Remove potential array name at the very beginning
    inputString = inputString.replace(new RegExp(`^${arrayName}\\s*=?\\s*`), '');

    const filterOutArrayNameFromResultArray = (arr) => { // remove item if it is the array name
        // return arr.filter(item => item !== arrayName);
        return arr.filter((item, index) => index !== 0 || item.toLowerCase() !== arrayName.toLowerCase());
    }
    // Function to extract strings between quotes
    function extractQuotedStrings(str, quoteChar) {
        const regex = new RegExp(`${quoteChar}((?:\\\\.|[^${quoteChar}\\\\])*)${quoteChar}`, 'g');
        return filterOutArrayNameFromResultArray(str.match(regex)?.map(m => m.slice(1, -1)) || []);
    }

    // Function to calculate score
    function calculateScore(arr) {
        return arr.reduce((score, str) => Math.max(score, 1) * (str.toLowerCase().match(/[a-z]/g) || []).length, 0);
    }

    // Extract strings with original quotes
    const doubleQuoted = extractQuotedStrings(inputString, '"');
    const singleQuoted = extractQuotedStrings(inputString, "'");

    // Remove first quote, then extract again
    const strippedInput = inputString.replace(/^['"]/, '');
    const strippedDoubleQuoted = extractQuotedStrings(strippedInput, '"');
    const strippedSingleQuoted = extractQuotedStrings(strippedInput, "'");

    // Combine all extracted arrays
    const allArrays = [doubleQuoted, singleQuoted, strippedDoubleQuoted, strippedSingleQuoted];

    // Calculate scores and find the best array
    let bestArray = [];
    let bestScore = 0;

    allArrays.forEach(arr => {
        if (arr.length > 0) {
            const score = calculateScore(arr);
            if (score > bestScore) {
                bestScore = score;
                bestArray = arr;
            }
        }
    });

    return bestArray;
}

function looseNumberParser(inputString, name, knownAttributes) {
    let primaryParserResult = primaryParser(inputString, name);
    let value: number | null = null
    if (primaryParserResult) {
        value = primaryParserResult
        // parseInt or PraseFloat
        if (typeof value === 'string') {
            value = parseFloat(value)
            if (isNaN(value)) {
                value = null
            }
        }
    }
    if (value) {
        return value
    }
    // Escape special regex characters in the name
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a regex that matches both quoted and unquoted names, followed by a number
    const regex = new RegExp(`(?:"${escapedName}"|${escapedName})\\s*[:=]?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i');

    const match = inputString.match(regex);
    if (match) {
        return parseFloat(match[1]);
    }

    return null;
}
function looseBooleanParser(inputString, name, knownAttributes) {
    let primaryParserResult = primaryParser(inputString, name);
    if (primaryParserResult) {
        return primaryParserResult?.toString()?.toLowerCase() == 'true';
    }
    // Convert the entire input string to lowercase
    const lowercaseInput = inputString.toLowerCase();

    // Find the positions of 'true' and 'false' in the lowercase input
    const trueIndex = lowercaseInput.indexOf('true');
    const falseIndex = lowercaseInput.indexOf('false');

    // If both 'true' and 'false' are found, return the one that appears first
    if (trueIndex !== -1 && falseIndex !== -1) {
        return trueIndex < falseIndex;
    }

    // If only 'true' is found, return true
    if (trueIndex !== -1) {
        return true;
    }

    // If only 'false' is found, return false
    if (falseIndex !== -1) {
        return false;
    }

    // If neither 'true' nor 'false' is found, return null
    return null;
}
function primaryParser(inputString, name) {
    try {
        let parseresult = bestMatchObjectAccess(parseRelaxedJson(inputString), name);
        if (parseresult != null && parseresult != undefined) {
        } {
            return parseresult
        }
    } catch (error) {
    }
    return null
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function trimAndSurroundWithBrackets(str) {
    // Trim leading characters until a single or double quote is found
    let start = 0;
    while (start < str.length && str[start] !== '"' && str[start] !== "'") {
        start++;
    }

    // Trim trailing characters until a comma, single or double quote is found
    let end = str.length - 1;
    while (end >= 0 && str[end] !== '"' && str[end] !== "'" && str[end] !== ',') {
        end--;
    }

    // Remove the comma if it's the last character
    if (str[end] === ',') {
        end--;
    }

    // Extract the trimmed substring
    let trimmedStr = str.substring(start, end + 1);

    // Surround the trimmed string with curly brackets if not already present
    if (trimmedStr[0] !== '{') {
        trimmedStr = '{' + trimmedStr;
    }
    if (trimmedStr[trimmedStr.length - 1] !== '}') {
        trimmedStr = trimmedStr + '}';
    }

    return trimmedStr;
}

function looseStringParser(inputString, name, knownAttributes) { // to do , filterout only attributes found nearby
    // prepare input by triming sides until single or double quotes are found
    inputString = trimAndSurroundWithBrackets(inputString);
    let primaryParserResult = primaryParser(inputString, name);
    if (primaryParserResult !== null && primaryParserResult !== undefined) {
        return primaryParserResult === '""' ? '' : primaryParserResult === "''" ? '' : primaryParserResult;
    }
    // Escape special regex characters in the name
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a regex that matches both quoted and unquoted names
    // const regex = new RegExp(`(?:"${escapedName}"|${escapedName})\\s*:?\\s*(?:["'](.+?)["']|([^\\s,]+))`, 'i');
    const regex = /(["'])(?:(?=(\\?))\2.)*?\1/g;

    let matches: string[] = [];
    let match;

    // Using a while loop to find all matches
    while ((match = regex.exec(inputString)) !== null) {
        matches.push(match[0].slice(1, -1)); // Remove the quotes from the match
    }


    // filterout all known attributes
    matches = matches.filter(match => !knownAttributes.includes(match) && !knownAttributes.includes(match.toLowerCase()));

    // return first non empty match , otherwise emty string if there is any match
    for (let i = 0; i < matches.length; i++) {
        if (matches[i]?.length > 0) {
            return matches[i];
        }
    }
    if (matches.length > 0) {
        return '';
    }

    return null;
}
function mapJSTypeToString(type) {
    // type can be String , Number , Boolean , [String] , [Number] , [Boolean] , [Object] , [Array]
    if (type === undefined) {
        return 'undefined';
    }
    if (Array.isArray(type)) {
        if (type.length === 0) {
            return 'Array';
        } else {
            return `[${mapJSTypeToString(type[0])}]`;
        }
    }
    if (typeof type === 'object') {
        return 'Object';
    }
    if (type.name) {
        return type.name;
    }
    return 'unknown';
}

function extractTypeFromSchema(schema, path) {
    // Takes in :
    // schema : object with leaf nodes value being one of these String , Number , Boolean , [String] , [Number] , [Boolean] , [Object] , [Array]
    // path : dot seperated path ( without array index )
    const segments = path.split('.');
    for (let i = 0; i < segments.length; i++) {
        if (Array.isArray(schema)) {
            if (schema.length === 0) {
                return undefined;
            }
            schema = schema[0];
        }
        if (schema[segments[i]] === undefined) {
            return undefined;
        }
        schema = schema[segments[i]];
    }
    return mapJSTypeToString(schema);
}

function getJSTypeParser(typeStr) {
    // switch type return parser function 
    switch (typeStr) {
        case 'String':
            return looseStringParser;
        case 'Number':
            return looseNumberParser;
        case 'Boolean':
            return looseBooleanParser;
        case '[String]':
            return looseStringArrayParser;
        default:
            return undefined;
    }
}


function hasArrayAncestor(path, schema) {
    const parts = path.split('.');
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) currentPath += '.';
        currentPath += parts[i];
        let schemaAtPath = getSchemaAtPath(schema, currentPath);
        // LOG({ schemaAtPath, currentPath, constructorName: schemaAtPath?.constructor?.name });
        if (schemaAtPath === Array || schemaAtPath?.constructor?.name === 'Array') {
            return true;
        } else {
            //  LOG(`Path ${currentPath} is of type ${typeof schemaAtPath}`);
        }
    }
    return false;
}

function parseRelaxedJson(inputString) {
    var parser = createParser();
    var json = parser.stringToValue(inputString);
    // Parse the relaxed JSON string
    return JSON.parse(json);

}


function bestMatchObjectAccess(obj, key, caseInsensitive = false, searchInKeys = false) {

    let bestMatch: string | null = null;
    let bestScore: number = Infinity;

    for (const objKey in obj) {
        const distance = levenshteinDistance(key, objKey);
        const score = distance / Math.max(key.length, objKey.length);

        if (score < bestScore) {
            bestScore = score;
            bestMatch = objKey;
        }
    }
    let result = bestMatch ? bestScore <= 0.30 ? obj[bestMatch] : null : null;
    if (result != null) {
        return result;
    }
    let lowCaseKey = key.toLowerCase();
    if (lowCaseKey !== key) {
        let noCaseResult = bestMatchObjectAccess(obj, lowCaseKey);
        if (noCaseResult != null) {
            return noCaseResult;
        }
    }
    if (caseInsensitive) {
        let cpy = {}
        for (const objKey in obj) {
            cpy[objKey.toLowerCase()] = obj[objKey];
        }
        obj = cpy;

        result = bestMatchObjectAccess(obj, key.toLocaleLowerCase(), false, false);
        if (result != null) {
            return result;
        }
    }

    if (searchInKeys) {
        for (const objKey in obj) {
            if (objKey.includes(key.toLocaleLowerCase())) {
                return obj[objKey];
            }
        }
    }
    return null;
}

function prepareSchema(schema, caseInsensitive = false) {
    // Function to recursively replace string type names with actual type objects
    // and optionally convert keys to lowercase
    const processSchemacase = (obj) => {
        const newObj = Array.isArray(obj) ? [] : {};
        for (const key in obj) {
            let newKey = caseInsensitive ? key.toLowerCase() : key;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                newObj[newKey] = processSchemacase(obj[key]);
            } else {
                newObj[newKey] = obj[key];
            }
        }
        return newObj;
    };

    const processSchemaValue = (obj) => {
        const newObj = Array.isArray(obj) ? [] : {};
        for (const key in obj) {
            let newKey = key;
            if (typeof obj[key] === 'string') {
                switch (obj[key].toLowerCase()) {
                    case 'number':
                        newObj[newKey] = Number;
                        break;
                    case 'string':
                        newObj[newKey] = String;
                        break;
                    case 'boolean':
                        newObj[newKey] = Boolean;
                        break;
                    case 'object':
                        newObj[newKey] = Object;
                        break;
                    // Add more types as needed
                    default:
                        newObj[newKey] = obj[key];
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                newObj[newKey] = processSchemaValue(obj[key]);
            } else {
                newObj[newKey] = obj[key];
            }
        }
        return newObj;
    };
    let parsedSchema: any = null
    let schemaCaseProcessed: any = null
    let schemaValueProcessed: any = null
    // Check if schema is a string
    if (typeof schema === 'string') {
        try {
            // Parse the string as JSON
            parsedSchema = parseRelaxedJson(schema);
        } catch (error) {
            throw new Error('Invalid schema string: ' + error.message);
        }
    } else {
        parsedSchema = schema
    }
    // Clone the schema to avoid modifying the original
    const clonedSchema = JSON.parse(safeStringify(parsedSchema));
    schemaValueProcessed = processSchemaValue(clonedSchema);
    schemaCaseProcessed = caseInsensitive ? processSchemacase(schemaValueProcessed) : schemaValueProcessed;
    return [clonedSchema, schemaCaseProcessed];
}

function deepTransformLeafMaps(obj, callback) {
    if (obj instanceof Map) {
        return callback(obj);
    }

    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepTransformLeafMaps(item, callback));
    }

    const result = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = deepTransformLeafMaps(obj[key], callback);
        }
    }
    return result;
}

/**
 * Predicts dot-paths associated with each line in a JSON string based on a given schema.
 *
 * @param {string} jsonString - The JSON string to process.
 * @param {object} schema - The schema defining the structure of the JSON.
 * @return {object} Object containing all possible dot-path line mappings and leaf node paths.
 */
export function parseJSON(jsonString, schema,
    {
        caseInsensitive,
        bestMatchAttribute,
    } = {
            caseInsensitive: true,
            bestMatchAttribute: true,
        }
) {
    // input : json string and schema
    //          json string : string of json
    //          schema : standard js object with one of the following values at leaf nodes :
    //          String , Number , Boolean , [String] , [Number] , [Boolean] ,[schema] (recursive) and for now Array,Object,[Array],[Object] are not supported
    // output :  [ ResultArray] , with ResultArray being an array of { path, line, arrayResolvedPath }  , with dot-paths being in lodash dot notation , ResultArrays are sorted by the number of leaf node dot-paths found in it ( higher means => more likely to be correct parsing )
    // process : 1. Json preprocessing : insert new line after every "{" , "}" ,"," , "[" , "]"
    //           2. Each lines is associated with an attribute name , this attribute is either found in that lines or is the last attribute found until that line, the attribute can be of any depth in the schema
    //           3. Input : [ [ attributeName , line ] ] , output : [ { path , line } ] ,
    //             we take lines associated with an attribute name and lines associated with complete dot-paths ( dot-paths are without arrays indexing still, that will be resolved later )
    //             In a output of his stage , the line is associated with a dot-path from the schema , this is deterministic mapping process,
    //             and when faced with multiple possible choices of associating a line to a dot-path , diffrent possible chooices can be explored in parallel using DFS ( depth first search ) 
    //             if it eventually the currently explored list of choices yields a result (  enables us to continue parsing until the end without facing an unexpected attribute) than we 
    //             note that as one correct list of chocies and store it in a result array 
    //           4. In each result object, pairs of { path , line } that share the same dot-path and are successive are joined into a single { path , LINE } with LINE being the joined lines of the pairs, however ones that have the same dot-path but are not successive are not joined
    // 5. filter out non leaf node dot-paths for each result
    // 6. Sort the result array by the number of leaf node dot-paths found in it
    // 7. process arrays : this is a non deterministic process, every left leaft node dot-path that has any array ancestor should have its indexing resolved for every array ancestor , for example : "hobbies.name" becomes "hobbies[0].name" 
    // however, arrays can be of any depth in the schema, and leaf nodes can have multiple array ancestors
    // to tackle this problem we start resolving arrays indexing from left to right, resolving the indecies of heigher depth arrays first
    // we get the complete paths of all arrays of all levels from schema ( arrays of objects only because arrays of basic types are consedered a leaf node that will later be assigned to a value ) and store them in an array sorted by depth , arrays paths here are abstract, in the sense that they are in dot notation without array indexing
    // we loop over all arrays paths in this array and for each array we check if an pair of { path , line } has a prefix of the array path , if so we keep going through the pairs finding the last pair that has the same prefix
    // we take that chunck of the array of pairs and take the dot-path of the first element in it, we split that chunck using the dot-path of the first element in the chunck, then we convert all pairs in that chunck to object of { path , line , arrayResolvedPath } such that each sub-chunck has the same index suffix example { path: "a.b.c.array.d", line: "line", arrayResolvedPath: "a.b.c.array[0].d" }
    // we continue that process for all arrays but each time we split the chuncks using the resolved array-index-path if found in that pair before otherwice we use normal dot-path
    // 8. convert to json shape
    // 9. map every result object to schema case if needed
    // 10 . parse values by leaf node type and replace string of linw with value
    // START 
    // 1. preprocess json and schema
    jsonString = prepareJson(jsonString)
    let [originalSchema, processedSchema] = prepareSchema(schema, caseInsensitive)
    schema = processedSchema
    // 2. predict lines attributes
    const [pairs, knownAttributes] = predictLinesAttributes(jsonString, schema, caseInsensitive, bestMatchAttribute)

    // 3. map lines to dot-path , we are basically trying to predict the real dot-path associated with each line , but because it is not deterministic we use DFS and store store all results that reach the end
    // forks that encounter unexpected attributes are aborted
    // dot-paths at this stage dont support arrays indexing , for example : "hobbies.name" instead of "hobbies[0].name" 
    const pathMapping = buildPathPredictionsMapping(schema) // use the schema to build a map that tells for every current predicted dot-path , what are the acceptable next attribute one can encounter in the list, if unexpected attribute is encountered , once can choose to abort the list of choices in DFS ,
    // the same map tells you if you encounter that attribute what are your list of path predictions
    LOG(`pathMapping : ${safeStringify(pathMapping)}`)
    let stack = [{          // stack of needed attibutes for DFS of 
        currentPath: "",
        currentResult: [],
        position: 0,
        forkId: 0  // DFS fork identifier
    }];

    // here one should not confuse termonology of "dot-path" of json and "path" of choices in DFS

    let allResults: any[] = []; // here we store all lists of choices that reach the end in DFS

    const LeaftNodesPaths: string[] = getLeafPaths(schema) // get all leaf node dot-paths , we can not pick leaf note dot-paths twice 

    // prepare pairs by removing all pairs with empty attribute at the start
    while (pairs[0]?.[1] === "") {
        pairs.shift();
    }

    const declareResult = (pushResult) => {  // returns exploredLeafsCount if pushed
        const exploredLeafsCount = pushResult.length
        if (exploredLeafsCount === 0) return exploredLeafsCount
        if (allResults.length === 0) {
            allResults.push({ result: pushResult, exploredLeafsCount });
            return exploredLeafsCount
        }
        let i = 0;
        while (i < allResults.length && exploredLeafsCount < allResults[i].exploredLeafsCount) {
            i++;
        }
        if (i === 0) {
            allResults.splice(i, 0, { result: pushResult, exploredLeafsCount });
            return exploredLeafsCount
        }
        return 0
    }
    LOG(`pairs : ${safeStringify(pairs)}`);
    while (stack.length > 0) { // DFS 
        let { currentPath, currentResult, position, forkId }: any = stack.pop(); // pop from stack our last picked choice
        while (position < pairs.length) {  // continue predicting future line dot-paths 
            // todo revice previous prediction based on collected value vs type if wrong abort
            // we take the new line attribute pair and if the attribute is new we use it to predict the dot-path of that line in the json
            const [line, attr] = pairs[position];
            LOG(`Processing line: "${line}", attribute: "${attr}"`, "forkId : ", forkId);
            if (attr === "") { // empty attribute nothing to predict
                LOG(`Empty attribute, pushing line with current dot-path: "${currentPath}"`, " forkId : ", forkId);
                currentResult.push({ path: currentPath || "undefined", line, arrayResolvedPath: currentPath || "undefined", attr: attr || "" });
                position++;
                continue;
            }
            if (!(currentPath in pathMapping)) { // this path is not even supposed to happen
                LOG(`Unexpected dot-path: ${currentPath}`, " forkId : ", forkId);

                if (forkId) {
                    //  break;
                }
            }

            const possibleAttrs = pathMapping[currentPath]; // get all possible attributes to encounter in the current dot-path as predicted by schema

            let possiblePaths = possibleAttrs[attr]; // possible dot-paths in the json after we see this attribute in the current dot-path
            if (!Array.isArray(possiblePaths)) { // is should only be an array, assertive check
                // here we should find the closest match in in the keys
                if (bestMatchAttribute) {
                    LOG(`Will search for best match attribute because attribute: "${attr}" is not found`, forkId);
                    possiblePaths = bestMatchObjectAccess(possibleAttrs, attr);
                }
                if (!Array.isArray(possiblePaths)) {
                    possiblePaths = [];
                    LOG(`Invalid possiblePaths: expected array but got ${typeof possiblePaths}`, "forkId : ", forkId);
                    if (forkId) {
                        // break;
                    }

                }
            }
            // filter possible paths by being legitimate or not
            possiblePaths = possiblePaths.filter(newPath => {
                const pickedBefore = currentResult.some(result => result.path === newPath);
                const processingArray = /* hasArrayAncestor(newPath, schema) || */ hasArrayAncestor(currentPath, schema);
                // does any other result already chose this prediction at this position
                const isBeingProcessedInParallel = allResults.some(result => result.result[position]?.forkId !== forkId && result.result[position]?.path === newPath);
                const shouldNotPick = pickedBefore && !processingArray || isBeingProcessedInParallel;
                LOG(`newpath : ${newPath} , pickedBefore : ${pickedBefore} , processingArray : ${processingArray} , isBeingProcessedInParallel : ${isBeingProcessedInParallel} , shouldNotPick : ${shouldNotPick} , forkId : ${forkId} `);
                return !shouldNotPick;
            })
            // sort by deepest first
            possiblePaths.sort((a, b) => {
                const partsA = a.split('.');
                const partsB = b.split('.');
                return partsB.length - partsA.length; // this is preferred but not mandatory
            });
            LOG(`at dot-path ${currentPath} found ${possiblePaths?.length} possible paths : ${possiblePaths}`, " forkId : ", forkId);
            // fork other choices computations , fork before alterning this thread data with choice pushing
            let childForkId = forkId + 1;
            for (let i = 1; i < possiblePaths.length; i++) {
                const newPath = possiblePaths[i];
                LOG(`Will try later path: "${newPath}"`, " with forkId : ", childForkId, " and position : ", position, " this fork id is : ", forkId);
                stack.push({
                    currentPath: newPath,
                    currentResult: [...currentResult, { path: newPath || "undefined", line, arrayResolvedPath: newPath || "undefined", attr: attr || "" }] as any,
                    position: position + 1,
                    forkId: childForkId
                });
                childForkId++;
            }
            // this fork takes first choice
            const pickedPath = possiblePaths[0];
            if (pickedPath) {
                currentResult.push({ path: pickedPath || "undefined", line, arrayResolvedPath: pickedPath || "undefined", attr: attr || "" });
                currentPath = pickedPath;
            } else {
                LOG(`No valid dot-paths found for attribute "${attr}" at dot-path: ${currentPath}`, " forkId : ", forkId);
                currentResult.push({ path: currentPath || "undefined", line, arrayResolvedPath: currentPath || "undefined", attr: attr || "" });
                if (forkId) {
                    declareResult(currentResult);
                    //  break;
                }
            }
            position++;
        }

        if (position === pairs.length || forkId == 0) { // we reached the end line of json , we can store this list of choices
            // a helper function that takes a result and decides if to push it and where to push it
            if (declareResult(currentResult) && forkId) { // we found all leaf nodes we dont need more search in DFS 
                break
            }
        }
    }

    // 4. for each result, join pairs that are successive and share the same dot-path but dont have an attribute name 
    allResults.forEach(resultObj => {
        const { result } = resultObj;
        let joinedResult: any[] = [];
        let lastPath = null;
        let accumulatedLines = "";
        let lastAttr = "";

        result.forEach(({ path, line, attr }, index) => {
            if (path === lastPath /* && !attr?.length */) { // if an attribute is so broken it will predict the same path as its previous so we join them
                accumulatedLines += line;
            } else {
                if (lastPath !== null) {
                    joinedResult.push({ path: lastPath || "undefined", line: accumulatedLines, arrayResolvedPath: lastPath || "undefined", attr: lastAttr || "" } as any);
                }
                lastPath = path;
                accumulatedLines = line;
                lastAttr = attr;
            }
        });

        if (lastPath !== null) {
            joinedResult.push({ path: lastPath || "undefined", line: accumulatedLines, arrayResolvedPath: lastPath || "undefined", attr: lastAttr || "" });
        }
        resultObj.result = joinedResult;
    });



    LOG({ joinedResults: safeStringify(allResults, null, 2) });

    // 5. Filter out non-leaf node dot-paths for each result
    allResults.forEach(resultObj => {
        const { result } = resultObj;
        resultObj.result = result.filter(({ path }) => LeaftNodesPaths.includes(path));
    });

    // 6. sort all results by the number of leaf dot-paths they explore
    // loop results and sort them by the number of leaf dot-paths they explore, decendending
    allResults.sort((a, b) => {
        const countA = a.result?.length;
        const countB = b.result?.length;
        return countB - countA;
    });

    // 7. process arrays
    const arrayPathsToProcess = getAllPathOfObjectArraysSortedByDepth(schema);

    allResults.forEach(resultObj => {
        let { result } = resultObj;
        arrayPathsToProcess.forEach((arrayPath: string) => {
            let indexCounter = -1;
            let firstElementPath: string | null = null;
            let seenPaths = new Set();

            result = result.map(({ path, line, arrayResolvedPath, attr }) => {
                if (path.startsWith(arrayPath)) { // this leaf node is inside an array
                    if (firstElementPath === null) {
                        firstElementPath = path;
                        indexCounter = 0;
                        seenPaths.add(path);
                    } else if (path === firstElementPath) {
                        if (seenPaths.has(path)) {
                            indexCounter++;
                            seenPaths.clear();
                        }
                        seenPaths.add(path);
                    } else {
                        seenPaths.add(path);
                    }

                    let parts = arrayResolvedPath.split('.');
                    let arrayPathParts = arrayPath.split('.');
                    let newResolvedPath = parts.map((part, index) => {
                        if (index === arrayPathParts.length - 1) {
                            return `${part}[${indexCounter}]`;
                        }
                        return part;
                    }).join('.');
                    return {
                        path: path || "undefined",
                        line,
                        arrayResolvedPath: newResolvedPath || "undefined",
                        attr
                    };
                } else if (firstElementPath?.length) {
                    firstElementPath = null;
                    indexCounter = -1;
                    seenPaths.clear();
                }
                return {
                    path: path || "undefined",
                    line,
                    arrayResolvedPath,
                    attr
                };
            });
        });
        resultObj.result = result;
    });

    // 8. convert to json shape
    allResults.forEach(resultObj => {
        const { result } = resultObj;
        let parsedObject = {}
        resultObj.result = result.map(({ path, line, arrayResolvedPath, attr }) => {
            const typeName = extractTypeFromSchema(schema, path);
            _.set(parsedObject, arrayResolvedPath, new Map([
                ["line", line],
                ["path", path],
                ["arrayResolvedPath", arrayResolvedPath],
                ["typeName", typeName],
                ["attr", attr]
            ]));
            return { path, line, arrayResolvedPath };
        });
        resultObj.result = parsedObject
    })

    // 9. for each result map object to schema case if needed
    if (caseInsensitive || bestMatchAttribute) {
        allResults.forEach(resultObj => {
            const { result } = resultObj;
            resultObj.result = mapObjectToSchemaCase(result, originalSchema);
        })
    }
    // 10. parse values
    allResults.forEach(resultObj => {
        const { result } = resultObj;

        resultObj.result = deepTransformLeafMaps(result, (leafMap) => {
            const typeName = leafMap.get("typeName")
            const line = leafMap.get("line")
            const attrName = leafMap.get("attr")
            const path = leafMap.get("path")
            const parser = getJSTypeParser(typeName);
            let value = null
            if (parser) {
                value = parser(line, attrName, knownAttributes);
            }
            return value
        })
    })


    return { allResults, LeaftNodesPaths };
}
const mapToObject = (map) => {
    const result = {};
    for (const [key, value] of map) {
        result[key] = value;
    }
    return result;
}
function getLeafPaths(schema, currentPath = '') {
    const leafPaths: string[] = [];

    function traverse(obj, path) {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newPath = path ? `${path}.${key}` : key;
                const value = obj[key];

                if (Array.isArray(value)) {
                    if (value.every(item => typeof item !== 'object')) {
                        leafPaths.push(newPath);
                    } else {
                        value.forEach((item, index) => traverse(item, `${newPath}`));
                    }
                } else if (typeof value === 'object' && value !== null) {
                    traverse(value, newPath);
                } else {
                    leafPaths.push(newPath);
                }
            }
        }
    }

    traverse(schema, currentPath);
    return leafPaths;
}


function getAllPathOfObjectArraysSortedByDepth(schema) {
    const paths: string[] = [];

    function traverse(obj, currentPath = "") {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newPath = currentPath ? `${currentPath}.${key}` : key;
                const value = obj[key];

                if (Array.isArray(value)) {
                    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                        paths.push(newPath);
                        traverse(value[0], newPath);
                    }
                } else if (typeof value === 'object' && value !== null) {
                    traverse(value, newPath);
                }
            }
        }
    }

    traverse(schema);

    paths.sort((a, b) => a.split('.').length - b.split('.').length);

    return paths;
}

const LOG = (...args) => null;