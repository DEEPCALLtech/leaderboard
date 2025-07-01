// Configuration constants
const VERSION = "1.1";
const UPCOMING = "July 2025 : 1400 total questions divided into easy questions and specialties, currently expanding the question dataset to identify bias and discrimination (AI Act EU). Extensive Medical Specialties list now available.";

// Global data storage
let evaluationData = null;
let modelColumns = [];
let modelMapping = {};
let columnsToShow = ["Rank", "Model", "Parameter Size", "General Accuracy", "Vital Accuracy"];
let characterReplacements = {};
let currentModels = [];
let additionalExtensions = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadAllData();
    setupEventListeners();
});

function setupEventListeners() {
    const specialtySelector = document.getElementById('specialty-selector');
    if (specialtySelector) {
        specialtySelector.addEventListener('change', updateTable);
    }
    
    const percentileInput = document.getElementById('network-percentile');
    if (percentileInput) {
        percentileInput.addEventListener('change', createModelSimilarityNetwork);
    }
}

async function loadAllData() {
    try {
        console.log('Starting data load...');
        
        // Load main evaluation data first
        const evalData = await loadCSV('data/model_evaluation_results.csv');
        console.log('Loaded evaluation data:', evalData.length, 'rows');
        
        // Load configuration files (these may not exist, so handle gracefully)
        const [
            columnsData,
            charactersData,
            modelsData,
            extensionsData
        ] = await Promise.allSettled([
            loadCSV('data/columns_to_show.csv'),
            loadCSV('data/characters_to_hide.csv'),
            loadCSV('data/current_models.csv'),
            loadCSV('data/additional_extension.csv')
        ]);
        
        // Process loaded data (handle failures gracefully)
        if (columnsData.status === 'fulfilled') {
            processColumnsToShow(columnsData.value);
        } else {
            console.log('columns_to_show.csv not found, using defaults');
        }
        
        if (charactersData.status === 'fulfilled') {
            processCharacterReplacements(charactersData.value);
        } else {
            console.log('characters_to_hide.csv not found, using defaults');
        }
        
        if (modelsData.status === 'fulfilled') {
            processCurrentModels(modelsData.value);
        } else {
            console.log('current_models.csv not found, using all models');
        }
        
        if (extensionsData.status === 'fulfilled') {
            processAdditionalExtensions(extensionsData.value);
        } else {
            console.log('additional_extension.csv not found, using defaults');
        }
        
        // Process main evaluation data
        const processedData = processEvaluationData(evalData);
        evaluationData = processedData.df;
        modelColumns = processedData.modelColumns;
        modelMapping = processedData.modelMapping;
        
        console.log('Processed data:', evaluationData.length, 'rows');
        console.log('Model columns:', modelColumns.length);
        
        // Populate specialty selector
        populateSpecialtySelector();
        
        // Load initial table
        updateTable();
        
        // Create weight vs accuracy plot
        createWeightAccuracyPlot();
        
        // Create model similarity network with default 1%
        createModelSimilarityNetwork();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data files. Please ensure CSV files are available in the data folder.');
    }
}

function loadCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors && results.errors.length > 0) {
                    console.warn('CSV parsing warnings for', url, ':', results.errors);
                }
                // Filter out completely empty rows
                const cleanData = results.data.filter(row => 
                    Object.values(row).some(val => val && String(val).trim() !== '')
                );
                resolve(cleanData);
            },
            error: function(error) {
                console.error('Error loading CSV:', url, error);
                reject(error);
            }
        });
    });
}

function processColumnsToShow(data) {
    if (data && data.length > 0) {
        try {
            // Handle CSV content that might be in a single cell or multiple formats
            const firstRow = data[0];
            const allValues = Object.values(firstRow);
            
            // Check if it's a single comma-separated string
            const firstValue = allValues[0];
            if (firstValue && typeof firstValue === 'string' && firstValue.includes(',')) {
                columnsToShow = firstValue.split(',').map(col => col.trim().replace(/['"]/g, ''));
            } else {
                // Otherwise, take all non-empty values
                columnsToShow = allValues.filter(val => val && String(val).trim() !== '').map(val => String(val).trim());
            }
            
            // Ensure we have the basic columns
            const requiredColumns = ["Rank", "Model", "Parameter Size", "General Accuracy", "Vital Accuracy"];
            if (columnsToShow.length === 0) {
                columnsToShow = requiredColumns;
            }
        } catch (error) {
            console.error('Error processing columns to show:', error);
            columnsToShow = ["Rank", "Model", "Parameter Size", "General Accuracy", "Vital Accuracy"];
        }
    }
    console.log('Loaded columns to show:', columnsToShow);
}

function processCharacterReplacements(data) {
    characterReplacements = {};
    if (data && data.length > 0) {
        try {
            data.forEach(row => {
                const keys = Object.keys(row);
                if (keys.length >= 2) {
                    const original = row[keys[0]];
                    const replacement = row[keys[1]];
                    if (original && replacement && String(original).trim() !== '' && String(replacement).trim() !== '') {
                        characterReplacements[String(original).trim().replace(/['"]/g, '')] = String(replacement).trim().replace(/['"]/g, '');
                    }
                }
            });
        } catch (error) {
            console.error('Error processing character replacements:', error);
        }
    }
    console.log('Loaded character replacements:', characterReplacements);
}

function processCurrentModels(data) {
    currentModels = [];
    if (data && data.length > 0) {
        try {
            data.forEach(row => {
                const keys = Object.keys(row);
                const model = row[keys[0]]; // Take first column
                if (model && String(model).trim() !== '') {
                    currentModels.push(String(model).trim());
                }
            });
        } catch (error) {
            console.error('Error processing current models:', error);
        }
    }
    console.log('Loaded current models:', currentModels.length, 'models');
}

function processAdditionalExtensions(data) {
    additionalExtensions = {};
    if (data && data.length > 0) {
        try {
            data.forEach(row => {
                const keys = Object.keys(row);
                if (keys.length >= 2) {
                    const modelName = row[keys[0]];
                    const extension = row[keys[1]];
                    if (modelName && extension && String(extension).toUpperCase() !== "NA") {
                        additionalExtensions[String(modelName).trim()] = String(extension).trim();
                    }
                }
            });
        } catch (error) {
            console.error('Error processing additional extensions:', error);
        }
    }
    console.log('Loaded additional extensions:', Object.keys(additionalExtensions).length, 'extensions');
}

function processEvaluationData(data) {
    console.log('Processing evaluation data...');
    
    if (!data || data.length === 0) {
        throw new Error('No evaluation data available');
    }
    
    // Convert to proper data structure and clean
    let df = data.filter(row => Object.values(row).some(val => val && String(val).trim() !== ''));
    
    // Drop Total Questions column if it exists
    df = df.map(row => {
        const newRow = { ...row };
        delete newRow['Total Questions'];
        return newRow;
    });
    
    // Add Difficulty column if it doesn't exist, default to MID
    df = df.map(row => ({
        ...row,
        Difficulty: row.Difficulty || 'MID'
    }));
    
    // Filter to keep both MID and EASY difficulty rows
    df = df.filter(row => {
        const difficulty = String(row.Difficulty).toUpperCase();
        return difficulty === 'MID' || difficulty === 'EASY';
    });
    
    // Process Nutrition specialty rows
    const nutritionRows = df.filter(row => 
        row.Specialty && String(row.Specialty).toLowerCase().includes('nutrition')
    );
    
    // Remove all nutrition rows first
    df = df.filter(row => 
        !row.Specialty || !String(row.Specialty).toLowerCase().includes('nutrition')
    );
    
    // Add back only specific nutrition rows with modified specialty name
    const nutritionIntakeRows = nutritionRows.filter(row => 
        row.Specialty === "Nutrition Intake Menu Intake and C"
    ).map(row => ({
        ...row,
        Specialty: "Nutrition"
    }));
    
    df = [...df, ...nutritionIntakeRows];
    
    // Get all model columns (excluding metadata columns)
    const metadataColumns = ["Specialty", "Score Type", "Difficulty"];
    const allModelColumns = Object.keys(df[0] || {}).filter(col => 
        !metadataColumns.includes(col) && col && col.trim() !== ''
    );
    
    console.log('Found model columns:', allModelColumns.length);
    
    // Convert percentage strings to floats
    df = df.map(row => {
        const newRow = { ...row };
        allModelColumns.forEach(col => {
            const value = newRow[col];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                let numValue = parseFloat(String(value).replace('%', '').replace(',', '.'));
                newRow[col] = isNaN(numValue) ? 0 : numValue;
            } else {
                newRow[col] = 0;
            }
        });
        return newRow;
    });
    
    // Filter model columns based on current models
    let filteredModelColumns = [];
    if (currentModels.length > 0) {
        currentModels.forEach(currentModel => {
            // Try exact match first
            if (allModelColumns.includes(currentModel)) {
                filteredModelColumns.push(currentModel);
                console.log('Exact match found:', currentModel);
            } else {
                // Try partial matches
                const currentClean = cleanDisplayName(currentModel).replace(/-cpu/g, '').replace(/-latest/g, '');
                const match = allModelColumns.find(col => {
                    const colClean = cleanDisplayName(col).replace(/-cpu/g, '').replace(/-latest/g, '');
                    return currentClean === colClean || currentModel === col;
                });
                if (match) {
                    filteredModelColumns.push(match);
                    console.log('Partial match found:', currentModel, '->', match);
                }
            }
        });
    }
    
    // If no matches found or no current models specified, keep all model columns
    if (filteredModelColumns.length === 0) {
        console.log('No current models specified or matched, using all model columns');
        filteredModelColumns = allModelColumns;
    }
    
    console.log('Final model columns:', filteredModelColumns.length);
    
    // Create "All Specialties" entries
    const allSpecialtiesRows = [];
    const scoreTypes = ["General", "Vital"];
    
    scoreTypes.forEach(scoreType => {
        const scoreTypeData = df.filter(row => row["Score Type"] === scoreType);
        
        if (scoreTypeData.length > 0) {
            const newRow = {
                "Specialty": "All Specialties",
                "Score Type": scoreType,
                "Difficulty": "MID"
            };
            
            // Calculate mean for each model
            filteredModelColumns.forEach(col => {
                const values = scoreTypeData.map(row => {
                    const val = parseFloat(row[col]);
                    return isNaN(val) ? 0 : val;
                });
                const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                newRow[col] = mean;
            });
            
            allSpecialtiesRows.push(newRow);
        }
    });
    
    // Add "All Specialties" rows to dataframe
    df = [...df, ...allSpecialtiesRows];
    
    // Create model mapping
    const mapping = {};
    filteredModelColumns.forEach(col => {
        const cleanName = cleanDisplayName(col)
            .replace(/-cpu/g, '')
            .replace(/-latest/g, '')
            .replace(/-instruct/g, '')
            .trim();
        mapping[col] = cleanName;
    });
    
    return {
        df: df,
        modelColumns: filteredModelColumns,
        modelMapping: mapping
    };
}

function cleanDisplayName(modelName) {
    if (!modelName) return '';
    const lastSlashIndex = String(modelName).lastIndexOf("/");
    if (lastSlashIndex !== -1) {
        return String(modelName).substring(lastSlashIndex + 1);
    }
    return String(modelName);
}

function extractParameterSize(modelName) {
    if (!modelName) return { cleanedName: '', parameterSize: '' };
    
    const pattern = /(\d+(?:\.\d+)?[bm])(?=\s|$|[-_])/gi;
    const matches = [...String(modelName).matchAll(pattern)];
    
    if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const parameterSize = lastMatch[1].toLowerCase();
        const cleanedName = String(modelName).substring(0, lastMatch.index) + 
                           String(modelName).substring(lastMatch.index + lastMatch[0].length);
        return {
            cleanedName: cleanedName.trim(),
            parameterSize: parameterSize
        };
    }
    
    return {
        cleanedName: String(modelName),
        parameterSize: ""
    };
}

function applyExtension(modelName) {
    if (!modelName) return '';
    const key = String(modelName);
    if (additionalExtensions[key] && String(additionalExtensions[key]).toUpperCase() !== "NA") {
        return `${key}-${additionalExtensions[key]}`;
    }
    return key;
}

function applyCharacterReplacements(modelName) {
    if (!modelName) return '';
    let result = String(modelName);
    Object.keys(characterReplacements).forEach(original => {
        result = result.replace(new RegExp(escapeRegExp(original), 'g'), characterReplacements[original]);
    });
    return result;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceUnderscoresWithSpaces(modelName) {
    if (!modelName) return '';
    return String(modelName).replace(/_/g, ' ');
}

function populateSpecialtySelector() {
    const selector = document.getElementById('specialty-selector');
    if (!selector || !evaluationData) return;
    
    const specialties = [...new Set(evaluationData.map(row => row.Specialty))].sort();
    
    selector.innerHTML = '';
    specialties.forEach(specialty => {
        if (specialty && String(specialty).trim() !== '') {
            const option = document.createElement('option');
            option.value = specialty;
            option.textContent = specialty;
            selector.appendChild(option);
        }
    });
    
    // Set default to "All Specialties" if available
    if (specialties.includes("All Specialties")) {
        selector.value = "All Specialties";
    } else if (specialties.length > 0) {
        selector.value = specialties[0];
    }
    
    console.log('Populated specialty selector with', specialties.length, 'specialties');
}

function createModelComparisonTable(specialty) {
    if (!specialty || !evaluationData || !modelColumns) {
        return [];
    }
    
    const filteredData = evaluationData.filter(row => row.Specialty === specialty);
    const tableData = [];
    
    modelColumns.forEach(modelCol => {
        let cleanModelName = modelMapping[modelCol] || modelCol;
        
        // Apply extension
        const extendedModelName = applyExtension(cleanModelName);
        
        // Apply character replacements
        const charReplacedModelName = applyCharacterReplacements(extendedModelName);
        
        // Replace underscores with spaces
        const finalModelName = replaceUnderscoresWithSpaces(charReplacedModelName);
        
        // Get General score
        const generalRow = filteredData.find(row => row["Score Type"] === "General");
        const generalScore = generalRow ? (parseFloat(generalRow[modelCol]) || 0) : 0;
        
        // Get Vital score
        const vitalRow = filteredData.find(row => row["Score Type"] === "Vital");
        const vitalScore = vitalRow ? (parseFloat(vitalRow[modelCol]) || 0) : 0;
        
        // Include model if it has scores or is in current models
        const shouldInclude = (generalScore >= 0 || vitalScore >= 0) || currentModels.includes(modelCol);
        
        if (shouldInclude) {
            tableData.push({
                "Model": finalModelName,
                "General Accuracy": generalScore,
                "Vital Accuracy": vitalScore
            });
        }
    });
    
    // Sort by General Accuracy (descending)
    tableData.sort((a, b) => (b["General Accuracy"] || 0) - (a["General Accuracy"] || 0));
    
    // Add rank and extract parameter sizes
    tableData.forEach((row, index) => {
        row.Rank = index + 1;
        const extracted = extractParameterSize(row.Model);
        row.Model = extracted.cleanedName;
        row["Parameter Size"] = extracted.parameterSize;
    });
    
    // Filter columns based on columnsToShow
    const orderedData = tableData.map(row => {
        const orderedRow = {};
        columnsToShow.forEach(col => {
            if (row.hasOwnProperty(col)) {
                orderedRow[col] = row[col];
            }
        });
        return orderedRow;
    });
    
    return orderedData;
}

function getColoredTable(data) {
    if (!data || data.length === 0) {
        return `
            <div style='
                color: var(--body-text-color, #666); 
                padding: 20px; 
                text-align: center;
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border-radius: 12px;
                border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                backdrop-filter: blur(10px);
            '>
                No models with non-zero scores in this category.
            </div>
        `;
    }
    
    let html = `
        <table style='
            width: 100%; 
            border-collapse: collapse; 
            background: var(--background-fill-primary, rgba(255,255,255,0.95)); 
            border-radius: 16px; 
            overflow: hidden; 
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            border: 1px solid var(--border-color-primary, rgba(255,255,255,0.18));
            backdrop-filter: blur(20px);
        '>
    `;
    
    // Header with dark mode compatible gradient
    html += `
        <tr style='
            background: var(--table-header-background, linear-gradient(135deg, #667eea 0%, #764ba2 100%)); 
            color: var(--table-header-text, #ffffff); 
            font-weight: 600;
        '>
    `;
    Object.keys(data[0]).forEach(col => {
        html += `
            <th style='
                border: none; 
                padding: 18px 16px; 
                text-align: left;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 600;
            '>
                ${col}
            </th>
        `;
    });
    html += "</tr>";
    
    // Data rows with enhanced dark mode support
    data.forEach((row, i) => {
        const isEven = i % 2 === 0;
        const bgColor = isEven 
            ? "var(--table-even-background-fill, rgba(248,249,250,0.4))" 
            : "var(--table-odd-background-fill, rgba(255,255,255,0.6))";
        const hoverColor = "var(--table-row-hover, rgba(99, 102, 241, 0.15))";
        
        html += `
            <tr style='
                background: ${bgColor}; 
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border-bottom: 1px solid var(--border-color-primary, rgba(255,255,255,0.08));
                backdrop-filter: blur(10px);
            ' 
            onmouseover='this.style.background="${hoverColor}"; this.style.transform="translateY(-2px)"; this.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)";' 
            onmouseout='this.style.background="${bgColor}"; this.style.transform="translateY(0)"; this.style.boxShadow="none";'>
        `;
        
        Object.keys(row).forEach(col => {
            if (col === 'Model') {
                // Color green when Vital Accuracy is 100%
                const vitalAccuracy = parseFloat(row['Vital Accuracy']) || 0;
                const isVitalPerfect = vitalAccuracy === 100;
                const color = isVitalPerfect 
                    ? 'var(--success-color, #10B981)' 
                    : 'var(--body-text-color, #1f2937)';
                const fontWeight = isVitalPerfect ? '700' : '500';
                const glow = isVitalPerfect ? 'text-shadow: 0 0 8px rgba(16, 185, 129, 0.3);' : '';
                
                html += `
                    <td style='
                        border: none; 
                        padding: 16px; 
                        color: ${color}; 
                        font-weight: ${fontWeight};
                        font-size: 14px;
                        ${glow}
                    '>
                        ${row[col] || ''}
                    </td>
                `;
            } else {
                html += `
                    <td style='
                        border: none; 
                        padding: 16px; 
                        color: var(--body-text-color, #1f2937);
                        font-size: 14px;
                        font-weight: 450;
                    '>
                `;
                
                if (col.includes('Accuracy')) {
                    const value = parseFloat(row[col]);
                    if (isNaN(value)) {
                        html += "<span style='color: var(--error-color, #EF4444); font-weight: 500;'>0.0%</span>";
                    } else {
                        // Enhanced color coding with gradients for accuracy values
                        let accuracyColor = 'var(--body-text-color, #1f2937)';
                        let bgGradient = '';
                        if (value >= 95) {
                            accuracyColor = 'var(--success-color, #059669)';
                            bgGradient = 'background: linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, transparent 100%);';
                        } else if (value >= 85) {
                            accuracyColor = 'var(--success-light, #10B981)';
                            bgGradient = 'background: linear-gradient(90deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%);';
                        } else if (value >= 70) {
                            accuracyColor = 'var(--warning-color, #D97706)';
                        } else if (value < 50) {
                            accuracyColor = 'var(--error-color, #DC2626)';
                        }
                        
                        html += `<span style='color: ${accuracyColor}; font-weight: 600; ${bgGradient} padding: 2px 6px; border-radius: 4px;'>${value.toFixed(1)}%</span>`;
                    }
                } else if (col === 'Rank') {
                    // Enhanced rank styling with better visual hierarchy
                    const rank = parseInt(row[col]);
                    let rankStyle = 'color: var(--body-text-color, #1f2937); font-weight: 600;';
                    
                    if (rank === 1) {
                        rankStyle = 'color: #FFD700; font-weight: 700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.4); background: linear-gradient(90deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%); padding: 4px 8px; border-radius: 6px;';
                    } else if (rank === 2) {
                        rankStyle = 'color: #C0C0C0; font-weight: 700; text-shadow: 0 0 6px rgba(192, 192, 192, 0.3); background: linear-gradient(90deg, rgba(192, 192, 192, 0.1) 0%, transparent 100%); padding: 4px 8px; border-radius: 6px;';
                    } else if (rank === 3) {
                        rankStyle = 'color: #CD7F32; font-weight: 700; text-shadow: 0 0 6px rgba(205, 127, 50, 0.3); background: linear-gradient(90deg, rgba(205, 127, 50, 0.1) 0%, transparent 100%); padding: 4px 8px; border-radius: 6px;';
                    }
                    
                    html += `<span style='${rankStyle}'>${row[col] || ''}</span>`;
                } else {
                    html += `<span style='font-weight: 500;'>${row[col] || ''}</span>`;
                }
                
                html += "</td>";
            }
        });
        html += "</tr>";
    });
    
    html += "</table>";
    return html;
}

function updateTable() {
    const specialtySelector = document.getElementById('specialty-selector');
    const tableContainer = document.getElementById('leaderboard-table');
    
    if (!specialtySelector || !tableContainer || !evaluationData) return;
    
    const specialty = specialtySelector.value;
    if (!specialty) return;
    
    try {
        const tableData = createModelComparisonTable(specialty);
        const htmlTable = getColoredTable(tableData);
        tableContainer.innerHTML = htmlTable;
    } catch (error) {
        console.error('Error updating table:', error);
        tableContainer.innerHTML = `
            <div style="
                color: var(--error-color, #EF4444); 
                padding: 20px; 
                text-align: center; 
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border: 1px solid var(--error-color, #EF4444); 
                border-radius: 12px;
                backdrop-filter: blur(10px);
            ">
                Error generating table: ${error.message}
            </div>
        `;
    }
}

function createWeightAccuracyPlot() {
    const container = document.getElementById('weight-accuracy-plot');
    
    if (!container || !evaluationData) {
        if (container) container.innerHTML = `
            <div style="
                padding: 20px; 
                text-align: center; 
                color: var(--body-text-color, #666);
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border-radius: 12px;
                border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                backdrop-filter: blur(10px);
            ">
                No data available for weight analysis
            </div>
        `;
        return;
    }
    
    try {
        // Get All Specialties General Accuracy data
        const allSpecialtiesGeneral = evaluationData.find(row => 
            row.Specialty === "All Specialties" && row["Score Type"] === "General"
        );
        
        if (!allSpecialtiesGeneral) {
            container.innerHTML = `
                <div style="
                    padding: 20px; 
                    text-align: center; 
                    color: var(--body-text-color, #666);
                    background: var(--background-fill-primary, rgba(255,255,255,0.05));
                    border-radius: 12px;
                    border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                    backdrop-filter: blur(10px);
                ">
                    No All Specialties data available
                </div>
            `;
            return;
        }
        
        const weightData = [];
        
        modelColumns.forEach(modelCol => {
            const cleanName = modelMapping[modelCol] || modelCol;
            const finalName = replaceUnderscoresWithSpaces(
                applyCharacterReplacements(
                    applyExtension(cleanName)
                )
            );
            
            // Extract parameter size and check if it contains 'b'
            const extracted = extractParameterSize(finalName);
            const paramSize = extracted.parameterSize;
            
            // Only include models with parameter sizes containing 'b'
            if (paramSize && paramSize.includes('b')) {
                const weightValue = parseFloat(paramSize.replace('b', ''));
                const accuracy = parseFloat(allSpecialtiesGeneral[modelCol]) || 0;
                
                if (!isNaN(weightValue) && weightValue > 0) {
                    weightData.push({
                        model: extracted.cleanedName,
                        weight: weightValue,
                        accuracy: accuracy,
                        paramSize: paramSize
                    });
                }
            }
        });
        
        if (weightData.length === 0) {
            container.innerHTML = `
                <div style="
                    padding: 20px; 
                    text-align: center; 
                    color: var(--body-text-color, #666);
                    background: var(--background-fill-primary, rgba(255,255,255,0.05));
                    border-radius: 12px;
                    border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                    backdrop-filter: blur(10px);
                ">
                    No models with valid weight parameters found
                </div>
            `;
            return;
        }
        
        const trace = {
            x: weightData.map(d => d.weight),
            y: weightData.map(d => d.accuracy),
            mode: 'markers+text',
            type: 'scatter',
            text: weightData.map(d => d.model),
            textposition: 'top center',
            marker: {
                size: 12,
                color: weightData.map(d => d.accuracy),
                colorscale: 'Viridis',
                colorbar: {
                    title: 'Accuracy (%)'
                },
                line: {
                    color: 'white',
                    width: 1
                }
            },
            hovertemplate: '<b>%{text}</b><br>' +
                          'Weight: %{x}B parameters<br>' +
                          'Accuracy: %{y:.1f}%<br>' +
                          '<extra></extra>'
        };
        
        const layout = {
            title: 'Model Weight vs General Accuracy (B-parameter models only)',
            xaxis: {
                title: 'Model Weight (Billion Parameters)',
                type: 'log'
            },
            yaxis: {
                title: 'General Accuracy (%)',
                range: [0, Math.max(100, Math.max(...weightData.map(d => d.accuracy)) + 10)]
            },
            height: 600,
            hovermode: 'closest',
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };
        
        container.innerHTML = '';
        Plotly.newPlot(container, [trace], layout, {responsive: true});
        
    } catch (error) {
        console.error('Error creating weight accuracy plot:', error);
        container.innerHTML = `
            <div style="
                padding: 20px; 
                text-align: center; 
                color: var(--error-color, #EF4444);
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border: 1px solid var(--error-color, #EF4444);
                border-radius: 12px;
                backdrop-filter: blur(10px);
            ">
                Error creating weight analysis plot: ${error.message}
            </div>
        `;
    }
}

function createModelSimilarityNetwork() {
    const container = document.getElementById('similarity-network');
    const percentileInput = document.getElementById('network-percentile');
    
    if (!container || !evaluationData) {
        if (container) container.innerHTML = `
            <div style="
                padding: 20px; 
                text-align: center; 
                color: var(--body-text-color, #666);
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border-radius: 12px;
                border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                backdrop-filter: blur(10px);
            ">
                No data available for network analysis
            </div>
        `;
        return;
    }
    
    try {
        // Check if vis.js is loaded
        if (typeof vis === 'undefined') {
            container.innerHTML = `
                <div style="
                    padding: 20px; 
                    text-align: center; 
                    color: var(--body-text-color, #666);
                    background: var(--background-fill-primary, rgba(255,255,255,0.05));
                    border-radius: 12px;
                    border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                    backdrop-filter: blur(10px);
                ">
                    Network visualization library not loaded
                </div>
            `;
            return;
        }
        
        // Get percentile threshold from input (default 1%)
        const percentile = percentileInput ? parseFloat(percentileInput.value) || 1 : 1;
        
        // Get All Specialties General Accuracy data to determine top models
        const allSpecialtiesGeneral = evaluationData.find(row => 
            row.Specialty === "All Specialties" && row["Score Type"] === "General"
        );
        
        if (!allSpecialtiesGeneral) {
            container.innerHTML = `
                <div style="
                    padding: 20px; 
                    text-align: center; 
                    color: var(--body-text-color, #666);
                    background: var(--background-fill-primary, rgba(255,255,255,0.05));
                    border-radius: 12px;
                    border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                    backdrop-filter: blur(10px);
                ">
                    No All Specialties data available for network analysis
                </div>
            `;
            return;
        }
        
        // Get model accuracies and sort by accuracy
        const modelAccuracies = modelColumns.map(modelCol => ({
            column: modelCol,
            name: modelMapping[modelCol] || modelCol,
            accuracy: parseFloat(allSpecialtiesGeneral[modelCol]) || 0
        })).sort((a, b) => b.accuracy - a.accuracy);
        
        // Select top percentile models
        const topModelCount = Math.max(1, Math.ceil(modelAccuracies.length * (percentile / 100)));
        const topModels = modelAccuracies.slice(0, topModelCount);
        
        console.log(`Showing top ${percentile}% (${topModelCount}) models for network analysis`);
        
        // Get all specialties (excluding All Specialties for network)
        const specialties = [...new Set(evaluationData.map(row => row.Specialty))].filter(s => s !== "All Specialties");
        
        if (specialties.length === 0) {
            container.innerHTML = `
                <div style="
                    padding: 20px; 
                    text-align: center; 
                    color: var(--body-text-color, #666);
                    background: var(--background-fill-primary, rgba(255,255,255,0.05));
                    border-radius: 12px;
                    border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                    backdrop-filter: blur(10px);
                ">
                    No specialty data available for network analysis
                </div>
            `;
            return;
        }
        
        // Prepare nodes: specialties (large red circles) and models (smaller circles)
        const nodes = [];
        const edges = [];
        let nodeId = 0;
        
        // Add specialty nodes (large red circles)
        const specialtyNodes = {};
        specialties.forEach(specialty => {
            const specialtyId = nodeId++;
            specialtyNodes[specialty] = specialtyId;
            nodes.push({
                id: specialtyId,
                label: specialty,
                group: 'specialty',
                color: {
                    background: '#DC2626',
                    border: '#B91C1C',
                    highlight: {
                        background: '#EF4444',
                        border: '#DC2626'
                    }
                },
                size: 40,
                font: {
                    color: '#ffffff',
                    size: 16,
                    face: 'Arial',
                    bold: true
                },
                physics: {
                    repulsion: {
                        nodeDistance: 300,
                        centralGravity: 0.1,
                        springLength: 200,
                        springConstant: 0.05
                    }
                }
            });
        });
        
        // Add model nodes and connect to specialties based on performance
        topModels.forEach(model => {
            const modelId = nodeId++;
            const extracted = extractParameterSize(model.name);
            const cleanModelName = extracted.cleanedName || model.name;
            
            nodes.push({
                id: modelId,
                label: cleanModelName,
                group: 'model',
                color: {
                    background: '#4ECDC4',
                    border: '#45B7AA',
                    highlight: {
                        background: '#5FDDD6',
                        border: '#4ECDC4'
                    }
                },
                size: 20 + (model.accuracy / 100) * 15, // Size based on accuracy
                font: {
                    color: '#ffffff',
                    size: 12,
                    face: 'Arial'
                },
                title: `${cleanModelName}<br>Overall Accuracy: ${model.accuracy.toFixed(1)}%`
            });
            
            // Connect model to specialties based on performance
            specialties.forEach(specialty => {
                const generalRow = evaluationData.find(row => 
                    row.Specialty === specialty && row["Score Type"] === "General"
                );
                
                if (generalRow) {
                    const specialtyAccuracy = parseFloat(generalRow[model.column]) || 0;
                    
                    // Connect if model has good performance in this specialty (>50%)
                    if (specialtyAccuracy > 50) {
                        const connectionStrength = specialtyAccuracy / 100;
                        edges.push({
                            from: modelId,
                            to: specialtyNodes[specialty],
                            value: connectionStrength,
                            color: {
                                color: `rgba(78, 205, 196, ${connectionStrength * 0.8})`,
                                highlight: '#FF6B6B'
                            },
                            width: 1 + connectionStrength * 3,
                            title: `${cleanModelName} → ${specialty}: ${specialtyAccuracy.toFixed(1)}%`,
                            length: 150 - connectionStrength * 50 // Shorter edges for stronger connections
                        });
                    }
                }
            });
        });
        
        const data = { nodes, edges };
        const options = {
            groups: {
                specialty: {
                    shape: 'dot',
                    size: 40,
                    font: { size: 16, color: '#ffffff' }
                },
                model: {
                    shape: 'dot',
                    size: 25,
                    font: { size: 12, color: '#ffffff' }
                }
            },
            physics: {
                enabled: true,
                stabilization: { iterations: 100 },
                barnesHut: {
                    gravitationalConstant: -15000,
                    centralGravity: 0.3,
                    springLength: 200,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.1
                },
                maxVelocity: 50,
                minVelocity: 0.1,
                timestep: 0.35
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                selectConnectedEdges: false
            },
            layout: {
                improvedLayout: true,
                clusterThreshold: 150
            }
        };
        
        container.innerHTML = `
            <div style="
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border-radius: 12px;
                border: 1px solid var(--border-color-primary, rgba(255,255,255,0.1));
                backdrop-filter: blur(10px);
                position: relative;
                overflow: hidden;
            ">
                <div id="network-vis" style="width: 100%; height: 600px;"></div>
            </div>
        `;
        
        const network = new vis.Network(document.getElementById('network-vis'), data, options);
        
        // Add legend with enhanced styling
        const legend = document.createElement('div');
        legend.className = 'network-legend';
        legend.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: var(--background-fill-primary, rgba(255,255,255,0.9));
            backdrop-filter: blur(20px);
            padding: 16px;
            border-radius: 12px;
            border: 1px solid var(--border-color-primary, rgba(255,255,255,0.2));
            font-size: 12px;
            color: var(--body-text-color, #1f2937);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            z-index: 1000;
        `;
        
        legend.innerHTML = `
            <div style="margin-bottom: 12px; font-weight: 600; color: var(--body-text-color, #1f2937);">Network Legend</div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <div style="width: 20px; height: 20px; background-color: #DC2626; border-radius: 50%; margin-right: 8px; border: 2px solid #B91C1C;"></div>
                <span>Medical Specialties</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <div style="width: 16px; height: 16px; background-color: #4ECDC4; border-radius: 50%; margin-right: 8px; border: 2px solid #45B7AA;"></div>
                <span>Top ${percentile}% Models</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <div style="width: 24px; height: 2px; background: linear-gradient(90deg, rgba(78, 205, 196, 0.3), rgba(78, 205, 196, 0.9)); margin-right: 8px;"></div>
                <span>Performance Links</span>
            </div>
            <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-color-primary, rgba(255,255,255,0.2)); font-size: 11px; color: var(--body-text-color-secondary, #6b7280);">
                <div>Models: ${topModels.length}</div>
                <div>Specialties: ${specialties.length}</div>
                <div>Connections: ${edges.length}</div>
            </div>
        `;
        
        container.firstChild.appendChild(legend);
        
    } catch (error) {
        console.error('Error creating similarity network:', error);
        container.innerHTML = `
            <div style="
                padding: 20px; 
                text-align: center; 
                color: var(--error-color, #EF4444);
                background: var(--background-fill-primary, rgba(255,255,255,0.05));
                border: 1px solid var(--error-color, #EF4444);
                border-radius: 12px;
                backdrop-filter: blur(10px);
            ">
                Error creating model similarity network: ${error.message}
            </div>
        `;
    }
}

function calculateCorrelation(x, y) {
    const n = x.length;
    if (n === 0 || n !== y.length) return 0;
    
    // Filter out any non-numeric values
    const pairs = [];
    for (let i = 0; i < n; i++) {
        const xVal = parseFloat(x[i]);
        const yVal = parseFloat(y[i]);
        if (!isNaN(xVal) && !isNaN(yVal)) {
            pairs.push([xVal, yVal]);
        }
    }
    
    if (pairs.length < 2) return 0;
    
    const xValues = pairs.map(p => p[0]);
    const yValues = pairs.map(p => p[1]);
    const count = pairs.length;
    
    const meanX = xValues.reduce((a, b) => a + b, 0) / count;
    const meanY = yValues.reduce((a, b) => a + b, 0) / count;
    
    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;
    
    for (let i = 0; i < count; i++) {
        const dx = xValues[i] - meanX;
        const dy = yValues[i] - meanY;
        numerator += dx * dy;
        sumXSquared += dx * dx;
        sumYSquared += dy * dy;
    }
    
    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    if (denominator === 0) return 0;
    
    return numerator / denominator;
}

function showError(message) {
    const errorHtml = `
        <div style="
            color: var(--error-color, #EF4444); 
            padding: 20px; 
            text-align: center; 
            background: var(--background-fill-primary, rgba(255,255,255,0.05));
            border: 1px solid var(--error-color, #EF4444); 
            border-radius: 12px; 
            margin: 20px 0;
            backdrop-filter: blur(10px);
        ">
            ${message}
        </div>
    `;
    
    const containers = [
        'leaderboard-table',
        'weight-accuracy-plot',
        'similarity-network'
    ];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = errorHtml;
        }
    });
}

// Window resize handler for responsive plots
window.addEventListener('resize', function() {
    // Resize Plotly plots
    const plotContainer = document.getElementById('weight-accuracy-plot');
    if (plotContainer && plotContainer.firstChild && typeof Plotly !== 'undefined') {
        Plotly.Plots.resize(plotContainer);
    }
});

// Export functions for potential external use
window.SpecialtiesApp = {
    updateTable,
    createWeightAccuracyPlot,
    createModelSimilarityNetwork,
    loadAllData
};
