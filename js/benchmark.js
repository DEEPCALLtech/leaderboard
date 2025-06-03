// Benchmark page script - Implementing the Python functionality in JavaScript
// Enhanced with alternative CSV loading methods

document.addEventListener('DOMContentLoaded', function() {
    // Set up loading indicator
    document.getElementById('results-table').innerHTML = 
        '<div class="loading"><div class="glow-spinner"></div>Loading benchmark data...</div>';
    
    // Try to load the CSV data using multiple methods
    loadCsvData('model_evaluation_results.csv')
        .then(data => {
            processData(data);
        })
        .catch(error => {
            console.error('Error loading CSV:', error);
            document.getElementById('results-table').innerHTML = 
                '<div class="no-results">Error loading data. Please try again later.</div>';
        });
});

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

function processData(data) {
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
    const modelColumns = Object.keys(df[0] || {}).filter(col => 
        !["Specialty", "Score Type", "Difficulty"].includes(col));
    
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
                    
                    // Calculate mean for each model (only for non-zero values)
                    modelColumns.forEach(col => {
                        // Get non-zero values
                        const nonZeroValues = scoreTypeDf
                            .filter(row => parseFloat(row[col]) > 0)
                            .map(row => parseFloat(row[col]));
                        
                        // Calculate mean if there are non-zero values, otherwise use 0
                        const meanValue = nonZeroValues.length > 0
                            ? nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length
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
        const cleanName = col.replace('-cpu', '').replace('-latest', '');
        modelMapping[col] = cleanName;
    });
    
    // Now set up the UI with the processed data
    setupUI(df, modelColumns, modelMapping);
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

function setupUI(df, modelColumns, modelMapping) {
    // Get unique specialties
    const specialties = [...new Set(df.map(row => row["Specialty"]))].sort();
    
    // Get unique difficulties (only Easy and Mid)
    let difficulties = [...new Set(df.map(row => row["Difficulty"]))].sort();
    difficulties = difficulties.filter(d => ["Easy", "Mid"].includes(d));
    
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
        difficultySelect.appendChild(option);
    });
    
    // Set up event listeners with debounce for better performance
    let timeoutId;
    specialtySelect.addEventListener('change', () => {
        clearTimeout(timeoutId);
        
        // Show loading animation
        document.getElementById('results-table').innerHTML = 
            '<div class="loading"><div class="glow-spinner"></div>Updating results...</div>';
        
        timeoutId = setTimeout(() => updateTable(df, modelColumns, modelMapping), 200);
    });
    
    difficultySelect.addEventListener('change', () => {
        clearTimeout(timeoutId);
        
        // Show loading animation
        document.getElementById('results-table').innerHTML = 
            '<div class="loading"><div class="glow-spinner"></div>Updating results...</div>';
        
        timeoutId = setTimeout(() => updateTable(df, modelColumns, modelMapping), 200);
    });
    
    // Initial table update
    updateTable(df, modelColumns, modelMapping);
}

function updateTable(df, modelColumns, modelMapping) {
    const specialty = document.getElementById('specialty-select').value;
    const difficulty = document.getElementById('difficulty-select').value;
    
    // Create model comparison table
    const result = createModelComparisonTable(df, specialty, difficulty, modelColumns, modelMapping);
    
    // Generate and display HTML table with a fade-in effect
    const resultsContainer = document.getElementById('results-table');
    resultsContainer.style.opacity = 0;
    
    setTimeout(() => {
        resultsContainer.innerHTML = getColoredTable(result);
        resultsContainer.style.opacity = 1;
    }, 200);
}

function createModelComparisonTable(df, specialty, difficulty, modelColumns, modelMapping) {
    // Filter data by specialty and difficulty
    let filteredData = df.filter(row => row["Specialty"] === specialty);
    
    if (difficulty !== "All") {
        filteredData = filteredData.filter(row => row["Difficulty"] === difficulty);
    }
    
    // Create a new array for the table display
    const tableData = [];
    
    // Get scores for General and Vital for each model
    modelColumns.forEach(modelCol => {
        const cleanModelName = modelMapping[modelCol];
        
        // Get General score (default to 0 if not found)
        const generalRow = filteredData.find(row => row["Score Type"] === "General");
        const generalScore = generalRow ? parseFloat(generalRow[modelCol]) : 0;
        
        // Get Vital score (default to 0 if not found)
        const vitalRow = filteredData.find(row => row["Score Type"] === "Vital");
        const vitalScore = vitalRow ? parseFloat(vitalRow[modelCol]) : 0;
        
        // Only add models that have non-zero scores in either General or Vital
        if (generalScore > 0 || vitalScore > 0) {
            tableData.push({
                "Model": cleanModelName,
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
    tableData.forEach(row => {
        const { Rank, ...rest } = row;
        Object.assign(row, { Rank, ...rest });
    });
    
    return tableData;
}

function getColoredTable(data) {
    // Check if data is empty
    if (data.length === 0) {
        return "<div class='no-results'>No models with non-zero scores in this category.</div>";
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
        html += "<tr>";
        
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

