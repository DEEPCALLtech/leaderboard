// Configuration constants
const VERSION = "1.1";
const UPCOMING = "July 2025 : 500 total questions, currently expanding the question dataset to identify bias and discrimination (AI Act EU). Extensive Medical Specialties list now available.";

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
        
        // Create model similarity network
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
    
    // Filter to only keep MID difficulty rows
    df = df.filter(row => row.Difficulty && String(row.Difficulty).toUpperCase() === 'MID');
    
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
        return "<div style='color: var(--body-text-color, #333); padding:20px; text-align:center;'>No models with non-zero scores in this category.</div>";
    }
    
    let html = "<table style='width:100%; border-collapse: collapse;'>";
    
    // Header
    html += "<tr style='background-color: var(--table-even-background-fill, #f8f9fa); color: var(--body-text-color, #333); font-weight: bold;'>";
    Object.keys(data[0]).forEach(col => {
        html += `<th style='border:1px solid var(--border-color-primary, #ddd); padding:8px; text-align:left;'>${col}</th>`;
    });
    html += "</tr>";
    
    // Data rows
    data.forEach((row, i) => {
        const bgColor = i % 2 === 0 ? "var(--table-odd-background-fill, #ffffff)" : "var(--table-even-background-fill, #f8f9fa)";
        html += `<tr style='background-color:${bgColor};'>`;
        
        Object.keys(row).forEach(col => {
            if (col === 'Model') {
                // Color green when Vital Accuracy is 100%
                const vitalAccuracy = parseFloat(row['Vital Accuracy']) || 0;
                const isVitalPerfect = vitalAccuracy === 100;
                const color = isVitalPerfect ? '#4CAF50' : 'var(--body-text-color, #333)';
                const fontWeight = isVitalPerfect ? 'bold' : 'normal';
                html += `<td style='border:1px solid var(--border-color-primary, #ddd); padding:8px; color:${color}; font-weight:${fontWeight};'>${row[col] || ''}</td>`;
            } else {
                html += `<td style='border:1px solid var(--border-color-primary, #ddd); padding:8px; color: var(--body-text-color, #333);'>`;
                
                if (col.includes('Accuracy')) {
                    const value = parseFloat(row[col]);
                    if (isNaN(value)) {
                        html += "0.0%";
                    } else {
                        html += `${value.toFixed(1)}%`;
                    }
                } else {
                    html += row[col] || '';
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
        tableContainer.innerHTML = '<div class="error-message">Error generating table</div>';
    }
}

function createWeightAccuracyPlot() {
    const container = document.getElementById('weight-accuracy-plot');
    
    if (!container || !evaluationData) {
        if (container) container.innerHTML = '<div class="no-data-message">No data available for weight analysis</div>';
        return;
    }
    
    try {
        // Get All Specialties General Accuracy data
        const allSpecialtiesGeneral = evaluationData.find(row => 
            row.Specialty === "All Specialties" && row["Score Type"] === "General"
        );
        
        if (!allSpecialtiesGeneral) {
            container.innerHTML = '<div class="no-data-message">No All Specialties data available</div>';
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
            container.innerHTML = '<div class="no-data-message">No models with valid weight parameters found</div>';
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
            hovermode: 'closest'
        };
        
        container.innerHTML = '';
        Plotly.newPlot(container, [trace], layout, {responsive: true});
        
    } catch (error) {
        console.error('Error creating weight accuracy plot:', error);
        container.innerHTML = '<div class="error-message">Error creating weight analysis plot</div>';
    }
}

function createModelSimilarityNetwork() {
    const container = document.getElementById('similarity-network');
    
    if (!container || !evaluationData) {
        if (container) container.innerHTML = '<div class="no-data-message">No data available for network analysis</div>';
        return;
    }
    
    try {
        // Check if vis.js is loaded
        if (typeof vis === 'undefined') {
            container.innerHTML = '<div class="no-data-message">Network visualization library not loaded</div>';
            return;
        }
        
        // Get all specialties data for each model
        const specialties = [...new Set(evaluationData.map(row => row.Specialty))].filter(s => s !== "All Specialties");
        
        if (specialties.length === 0) {
            container.innerHTML = '<div class="no-data-message">No specialty data available for network analysis</div>';
            return;
        }
        
        const modelPerformanceData = {};
        
        modelColumns.forEach(modelCol => {
            const cleanName = modelMapping[modelCol] || modelCol;
            const finalName = replaceUnderscoresWithSpaces(
                applyCharacterReplacements(
                    applyExtension(cleanName)
                )
            );
            
            const extracted = extractParameterSize(finalName);
            const modelKey = extracted.cleanedName || modelCol;
            
            modelPerformanceData[modelKey] = {};
            
            specialties.forEach(specialty => {
                const generalRow = evaluationData.find(row => 
                    row.Specialty === specialty && row["Score Type"] === "General"
                );
                const accuracy = generalRow ? (parseFloat(generalRow[modelCol]) || 0) : 0;
                modelPerformanceData[modelKey][specialty] = accuracy;
            });
        });
        
        // Calculate similarity between models
        const models = Object.keys(modelPerformanceData);
        if (models.length < 2) {
            container.innerHTML = '<div class="no-data-message">Not enough models for network analysis</div>';
            return;
        }
        
        const nodes = models.map((model, index) => ({
            id: index,
            label: model,
            color: {
                background: '#4ECDC4',
                border: '#45B7AA',
                highlight: {
                    background: '#FF6B6B',
                    border: '#FF5252'
                }
            }
        }));
        
        const edges = [];
        const threshold = 0.8; // Similarity threshold
        
        for (let i = 0; i < models.length; i++) {
            for (let j = i + 1; j < models.length; j++) {
                const model1 = models[i];
                const model2 = models[j];
                
                // Calculate correlation coefficient
                const values1 = specialties.map(s => modelPerformanceData[model1][s] || 0);
                const values2 = specialties.map(s => modelPerformanceData[model2][s] || 0);
                
                const correlation = calculateCorrelation(values1, values2);
                
                if (correlation > threshold) {
                    edges.push({
                        from: i,
                        to: j,
                        value: correlation,
                        label: `${(correlation * 100).toFixed(1)}%`,
                        color: {
                            color: `rgba(78, 205, 196, ${correlation})`,
                            highlight: '#FF6B6B'
                        }
                    });
                }
            }
        }
        
        const data = { nodes, edges };
        const options = {
            nodes: {
                shape: 'dot',
                size: 20,
                font: {
                    size: 14,
                    color: '#333'
                },
                borderWidth: 2
            },
            edges: {
                width: 2,
                smooth: {
                    type: 'continuous'
                }
            },
            physics: {
                stabilization: false,
                barnesHut: {
                    gravitationalConstant: -8000,
                    springConstant: 0.001,
                    springLength: 200
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 300
            }
        };
        
        container.innerHTML = '<div id="network-vis" style="width: 100%; height: 500px;"></div>';
        const network = new vis.Network(document.getElementById('network-vis'), data, options);
        
        // Add legend
        const legend = document.createElement('div');
        legend.className = 'network-legend';
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #4ECDC4;"></div>
                <span>Models</span>
            </div>
            <div class="legend-item">
                <div class="legend-line"></div>
                <span>Similarity > 80%</span>
            </div>
            <div class="legend-item">
                <span>Total Models: ${models.length}</span>
            </div>
            <div class="legend-item">
                <span>Connections: ${edges.length}</span>
            </div>
        `;
        container.appendChild(legend);
        
    } catch (error) {
        console.error('Error creating similarity network:', error);
        container.innerHTML = '<div class="error-message">Error creating model similarity network</div>';
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
    const errorHtml = `<div class="error-message" style="color: #ff4444; padding: 20px; text-align: center; border: 1px solid #ff4444; border-radius: 5px; margin: 20px 0;">${message}</div>`;
    
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
