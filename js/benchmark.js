// Benchmark page script - Implementing the Python functionality in JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Set up loading indicator
    document.getElementById('results-table').innerHTML = 
        '<div class="loading"><div class="glow-spinner"></div>Loading benchmark data...</div>';
    
    // First load the current models list if available
    Promise.all([
        loadTextFile('current_models.csv'),
        loadTextFile('additional_extension.csv'),
        loadCsvData('model_evaluation_results.csv')
    ])
    .then(([currentModelsText, extensionsText, csvData]) => {
        // Parse current models
        const currentModels = currentModelsText ? 
            currentModelsText.split('\n').filter(line => line.trim()) : [];
        
        // Parse extensions
        const extensions = {};
        if (extensionsText) {
            extensionsText.split('\n').forEach(line => {
                if (line.trim() && line.includes(',')) {
                    const [modelName, extension] = line.split(',', 2).map(part => part.trim());
                    extensions[modelName] = extension;
                }
            });
        }
        
        // Process the main CSV data
        processData(csvData, currentModels, extensions);
    })
    .catch(error => {
        console.error('Error loading data:', error);
        document.getElementById('results-table').innerHTML = 
            '<div class="no-results">Error loading data. Please try again later.</div>';
    });
});

// Helper function to load text files
async function loadTextFile(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`File ${url} not found or error loading it`);
            return null;
        }
        return await response.text();
    } catch (error) {
        console.warn(`Could not load ${url}:`, error);
        return null;
    }
}

// Function to try multiple loading methods for CSV
async function loadCsvData(url) {
    // Try fetch API first (most modern approach)
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const csvText = await response.text();
        
        // Parse CSV manually with Papa Parse
        const result = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true
        });
        
        if (result.errors && result.errors.length > 0) {
            console.warn('Warning: CSV parse had errors:', result.errors);
        }
        
        return result.data;
    } catch (fetchError) {
        console.warn('Fetch loading failed, trying XHR method:', fetchError);
        
        // Fallback to XMLHttpRequest if fetch fails
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'text';
            
            xhr.onload = function() {
                if (xhr.status === 200) {
                    const result = Papa.parse(xhr.responseText, {
                        header: true,
                        skipEmptyLines: true
                    });
                    resolve(result.data);
                } else {
                    reject(new Error(`XHR failed with status: ${xhr.status}`));
                }
            };
            
            xhr.onerror = function() {
                reject(new Error('Network error occurred while trying to load CSV'));
            };
            
            xhr.send();
        });
    }
}

// Helper function to clean display names by removing path
function cleanDisplayName(modelName) {
    const lastSlashIndex = modelName.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
        return modelName.substring(lastSlashIndex + 1);
    }
    return modelName;
}

// Apply extension to model name if exact match found
function applyExtension(modelName, extensions) {
    if (modelName in extensions) {
        const extension = extensions[modelName];
        if (extension.toUpperCase() !== "NA") {
            return `${modelName}-${extension}`;
        }
    }
    return modelName;
}

function processData(data, currentModels, extensions) {
    // Display loading message with a glowing effect
    document.getElementById('results-table').innerHTML = 
        '<div class="loading"><div class="glow-text">Processing data...</div></div>';
    
    // Process the data similarly to the Python code
    let df = data;
    
    // Drop "Total Questions" column if it exists
    if (df.length > 0 && "Total Questions" in df[0]) {
        df = df.map(row => {
            const { ["Total Questions"]: removed, ...rest } = row;
            return rest;
        });
    }
    
    // Add Difficulty column if it doesn't exist with default value "EASY"
    df = df.map(row => {
        if (!("Difficulty" in row)) {
            return { ...row, "Difficulty": "EASY" };
        }
        return row;
    });
    
    // Standardize difficulty values
    df = df.map(row => {
        const difficulty = row["Difficulty"];
        if (String(difficulty).toUpperCase() === "EASY") {
            return { ...row, "Difficulty": "Easy" };
        } else if (String(difficulty).toUpperCase() === "MID") {
            return { ...row, "Difficulty": "Mid" };
        }
        return row;
    });
    
    // Process Nutrition specialty rows
    // First, identify Nutrition rows
    const nutritionRows = df.filter(row => 
        row["Specialty"] && row["Specialty"].toLowerCase().includes("nutrition"));
    
    // Remove all Nutrition rows from the dataframe
    df = df.filter(row => 
        !row["Specialty"] || !row["Specialty"].toLowerCase().includes("nutrition"));
    
    // Only keep and modify specific Nutrition rows
    const nutritionRecommendations = nutritionRows.filter(row => 
        row["Specialty"] === "Nutrition Recommendations").map(row => ({
            ...row,
            "Specialty": "Nutrition",
            "Difficulty": "Easy"
        }));
    
    const nutritionIntake = nutritionRows.filter(row => 
        row["Specialty"] === "Nutrition Intake Menu Intake and C").map(row => ({
            ...row,
            "Specialty": "Nutrition",
            "Difficulty": "Mid"
        }));
    
    // Add back the filtered nutrition rows
    df = [...df, ...nutritionRecommendations, ...nutritionIntake];
    
    // Remove duplicate rows
    df = removeDuplicates(df);
    
    // Get model columns (all columns except Specialty, Score Type, and Difficulty)
    const allModelColumns = Object.keys(df[0] || {}).filter(col => 
        !["Specialty", "Score Type", "Difficulty"].includes(col));
    
    // Filter model columns based on current_models.csv if it exists
    let modelColumns = allModelColumns;
    if (currentModels && currentModels.length > 0) {
        console.log("Filtering models based on current_models.csv");
        const filteredColumns = [];
        
        for (const currentModel of currentModels) {
            // Try exact match first
            if (allModelColumns.includes(currentModel)) {
                filteredColumns.push(currentModel);
                console.log(`Exact match found: ${currentModel}`);
            } else {
                // Try partial matches by cleaning names
                const currentClean = cleanDisplayName(currentModel).replace('-cpu', '').replace('-latest', '');
                for (const col of allModelColumns) {
                    const colClean = cleanDisplayName(col).replace('-cpu', '').replace('-latest', '');
                    if (currentClean === colClean || currentModel === col) {
                        filteredColumns.push(col);
                        console.log(`Partial match found: ${currentModel} -> ${col}`);
                        break;
                    }
                }
            }
        }
        
        // If matches found, use the filtered list
        if (filteredColumns.length > 0) {
            modelColumns = filteredColumns;
            console.log(`Using ${filteredColumns.length} filtered models`);
        } else {
            console.log("No matching models found, using all model columns");
        }
    }
    
    // Convert percentage strings to floats
    df = df.map(row => {
        const newRow = { ...row };
        modelColumns.forEach(col => {
            const value = row[col];
            if (value !== null && value !== undefined && value !== '') {
                newRow[col] = parseFloat(String(value).replace('%', '')) || 0;
            } else {
                newRow[col] = 0;
            }
        });
        return newRow;
    });
    
    // Create "All Specialties" entries for Easy and Mid difficulties
    const allSpecialtiesRows = [];
    
    for (const difficulty of ["Easy", "Mid"]) {
        // Filter rows for current difficulty
        const difficultyDf = df.filter(row => row["Difficulty"] === difficulty);
        
        if (difficultyDf.length > 0) {
            // For each Score Type (General and Vital)
            for (const scoreType of ["General", "Vital"]) {
                const scoreTypeDf = difficultyDf.filter(row => row["Score Type"] === scoreType);
                
                if (scoreTypeDf.length > 0) {
                    // Create new row for "All Specialties"
                    const newRow = {
                        "Specialty": "All Specialties",
                        "Score Type": scoreType,
                        "Difficulty": difficulty
                    };
                    
                    // Calculate mean for each model (including ALL values, even zeros)
                    modelColumns.forEach(col => {
                        // Get ALL values (including zeros)
                        const allValues = scoreTypeDf.map(row => parseFloat(row[col] || 0));
                        
                        // Calculate mean of all values
                        const meanValue = allValues.length > 0
                            ? allValues.reduce((a, b) => a + b, 0) / allValues.length
                            : 0;
                        
                        newRow[col] = meanValue;
                    });
                    
                    allSpecialtiesRows.push(newRow);
                }
            }
        }
    }
    
    // Add the "All Specialties" rows to the dataframe
    df = [...df, ...allSpecialtiesRows];
    
    // Remove rows with Difficulty "All"
    df = df.filter(row => row["Difficulty"] !== "All");
    
    // Create clean model names mapping, removing -cpu and -latest
    const modelMapping = {};
    modelColumns.forEach(col => {
        // First clean the display name (remove path)
        let cleanName = cleanDisplayName(col);
        // Then remove -cpu and -latest suffixes
        cleanName = cleanName.replace('-cpu', '').replace('-latest', '');
        modelMapping[col] = cleanName;
    });
    
    // Now set up the UI with the processed data
    setupUI(df, modelColumns, modelMapping, extensions);
}

function removeDuplicates(array) {
    const seen = new Set();
    return array.filter(item => {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
            return false;
        } else {
            seen.add(key);
            return true;
        }
    });
}

function setupUI(df, modelColumns, modelMapping, extensions) {
    // Get unique specialties
    const specialties = [...new Set(df.map(row => row["Specialty"]))].sort();
    
    // Get unique difficulties (only Easy and Mid)
    let difficulties = [...new Set(df.map(row => row["Difficulty"]))].sort();
    difficulties = difficulties.filter(d => ["Easy", "Mid"].includes(d));
    
    // Variables to track default selections
    let defaultSpecialty = "All Specialties";
    let defaultDifficulty = "Easy";
    
    // Check if our desired defaults exist in the data
    if (!specialties.includes(defaultSpecialty)) {
        defaultSpecialty = specialties[0]; // Fall back to first specialty
    }
    
    if (!difficulties.includes(defaultDifficulty)) {
        defaultDifficulty = difficulties[0]; // Fall back to first difficulty
    }
    
    // Populate specialty dropdown
    const specialtySelect = document.getElementById('specialty-select');
    specialtySelect.innerHTML = '';
    
    // Add a cool cyber animation effect as options are added
    let delay = 0;
    specialties.forEach(specialty => {
        setTimeout(() => {
            const option = document.createElement('option');
            option.value = specialty;
            option.textContent = specialty;
            
            // Select "All Specialties" by default
            if (specialty === defaultSpecialty) {
                option.selected = true;
            }
            
            specialtySelect.appendChild(option);
        }, delay);
        delay += 50; // Stagger the additions
    });
    
    // Populate difficulty dropdown
    const difficultySelect = document.getElementById('difficulty-select');
    difficultySelect.innerHTML = '';
    
    difficulties.forEach(difficulty => {
        const option = document.createElement('option');
        option.value = difficulty;
        option.textContent = difficulty;
        
        // Select "Easy" by default
        if (difficulty === defaultDifficulty) {
            option.selected = true;
        }
        
        difficultySelect.appendChild(option);
    });
    
    // Set up event listeners with debounce for better performance
    let timeoutId;
    specialtySelect.addEventListener('change', () => {
        clearTimeout(timeoutId);
        
        // Show loading animation
        document.getElementById('results-table').innerHTML = 
            '<div class="loading"><div class="glow-spinner"></div>Updating results...</div>';
        
        timeoutId = setTimeout(() => updateTable(df, modelColumns, modelMapping, extensions), 200);
    });
    
    difficultySelect.addEventListener('change', () => {
        clearTimeout(timeoutId);
        
        // Show loading animation
        document.getElementById('results-table').innerHTML = 
            '<div class="loading"><div class="glow-spinner"></div>Updating results...</div>';
        
        timeoutId = setTimeout(() => updateTable(df, modelColumns, modelMapping, extensions), 200);
    });
    
    // Wait for dropdowns to be fully populated before updating the table
    // This ensures our default values are set
    setTimeout(() => {
        // Force the default values in case the DOM hasn't updated yet
        specialtySelect.value = defaultSpecialty;
        difficultySelect.value = defaultDifficulty;
        
        // Initial table update with our default values
        updateTable(df, modelColumns, modelMapping, extensions, defaultSpecialty, defaultDifficulty);
    }, specialties.length * 50 + 100); // Wait for all options to be added
}

function updateTable(df, modelColumns, modelMapping, extensions, forceSpecialty, forceDifficulty) {
    // Get selected values from dropdowns, or use forced values if provided
    const specialty = forceSpecialty || document.getElementById('specialty-select').value;
    const difficulty = forceDifficulty || document.getElementById('difficulty-select').value;
    
    console.log(`Updating table for Specialty: ${specialty}, Difficulty: ${difficulty}`);
    
    // Create model comparison table
    const result = createModelComparisonTable(df, specialty, difficulty, modelColumns, modelMapping, extensions);
    
    // Generate and display HTML table with a fade-in effect
    const resultsContainer = document.getElementById('results-table');
    resultsContainer.style.opacity = 0;
    
    setTimeout(() => {
        resultsContainer.innerHTML = getColoredTable(result);
        resultsContainer.style.opacity = 1;
    }, 200);
}

function createModelComparisonTable(df, specialty, difficulty, modelColumns, modelMapping, extensions) {
    // Filter data by specialty and difficulty
    let filteredData = df.filter(row => row["Specialty"] === specialty);
    
    if (difficulty !== "All") {
        filteredData = filteredData.filter(row => row["Difficulty"] === difficulty);
    }
    
    // Log the filtered data for debugging
    console.log(`Found ${filteredData.length} rows matching criteria`);
    
    // Create a new array for the table display
    const tableData = [];
    
    // Get scores for General and Vital for each model
    modelColumns.forEach(modelCol => {
        const cleanModelName = modelMapping[modelCol];
        
        // Apply extension if exact match found
        const extendedModelName = applyExtension(cleanModelName, extensions || {});
        console.log(`Model: ${cleanModelName} -> Extended: ${extendedModelName}`);
        
        // Get General score (default to 0 if not found)
        const generalRow = filteredData.find(row => row["Score Type"] === "General");
        const generalScore = generalRow ? parseFloat(generalRow[modelCol]) : 0;
        
        // Get Vital score (default to 0 if not found)
        const vitalRow = filteredData.find(row => row["Score Type"] === "Vital");
        const vitalScore = vitalRow ? parseFloat(vitalRow[modelCol]) : 0;
        
        // Always include the model if it's in currentModels list or has non-zero scores
        const shouldInclude = true; // We'll always include models now, as filtering happens earlier
        
        if (shouldInclude) {
            tableData.push({
                "Model": extendedModelName,
                "General Accuracy": generalScore,
                "Vital Accuracy": vitalScore
            });
        }
    });
    
    // Sort by General Accuracy (descending)
    tableData.sort((a, b) => b["General Accuracy"] - a["General Accuracy"]);
    
    // Add Rank column
    tableData.forEach((row, index) => {
        row.Rank = index + 1;
    });
    
    // Move Rank to the beginning
    const rankedData = tableData.map(row => {
        const { Rank, ...rest } = row;
        return { Rank, ...rest };
    });
    
    return rankedData;
}

function getColoredTable(data) {
    // Check if data is empty
    if (!data || data.length === 0) {
        return `<div class='no-results'>
            <p>No models with non-zero scores in this category.</p>
            <p>Please try selecting "All Specialties" and "Easy" from the dropdowns.</p>
        </div>`;
    }
    
    let html = "<table class='results-table'>";
    
    // Header
    html += "<tr>";
    for (const col in data[0]) {
        html += `<th>${col}</th>`;
    }
    html += "</tr>";
    
    // Data rows
    data.forEach((row, i) => {
        // Alternating row background
        const rowClass = i % 2 === 0 ? "odd-row" : "even-row";
        html += `<tr class="${rowClass}">`;
        
        for (const col in row) {
            if (col === 'Model') {
                // Color green when Vital Accuracy is 100%, otherwise neutral white
                if (row['Vital Accuracy'] === 100) {
                    html += `<td class="green-text">${row[col]}</td>`;
                } else {
                    html += `<td>${row[col]}</td>`;
                }
            } else {
                // Regular cell
                let cellContent = "";
                
                if (col !== 'Rank') {
                    // Add percentage for score columns, handling NaN values
                    const value = row[col];
                    if (isNaN(value)) {
                        cellContent = "0.0%";
                    } else {
                        cellContent = `${value.toFixed(1)}%`;
                    }
                } else {
                    cellContent = row[col];
                }
                
                html += `<td>${cellContent}</td>`;
            }
        }
        
        html += "</tr>";
    });
    
    html += "</table>";
    return html;
}
