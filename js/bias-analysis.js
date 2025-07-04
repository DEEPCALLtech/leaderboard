// Configuration
const TOP_PERCENTILE_DISCRIMINATION = 0.4;
const TOP_PERCENTILE_ACCURACY = 0.2;
const TOP_PERFORMANCE_THRESHOLD = 20;

// Global data storage
let resultsData = null;
let fairnessData = null;
let performanceData = null;
let ethnicityData = null;
let genderData = null;
let discriminationData = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    setupEventListeners();
});

function setupEventListeners() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const sortMethod = document.getElementById('sort-method');
    
    analyzeBtn.addEventListener('click', runAnalysisWithLayoutFix);
    sortMethod.addEventListener('change', runAnalysisWithLayoutFix);
}

async function loadData() {
    try {
        // Load CSV files (you'll need to host these on your GitHub)
        const [results, fairness, performance, ethnicity, gender, discrimination] = await Promise.all([
            loadCSV('data/model_eval_final.csv'),
            loadCSV('data/fairness_ranking.csv'),
            loadCSV('data/performance_ranking.csv'),
            loadCSV('data/ethnicity.csv'),
            loadCSV('data/gender.csv'),
            loadCSV('data/discrimination.csv')
        ]);
        
        // Clean model names (remove -cpu)
        results.forEach(row => {
            if (row['Model Name']) {
                row['Model Name'] = row['Model Name'].replace(/-cpu/gi, '');
            }
        });
        
        fairness.forEach(row => {
            if (row['Model']) {
                row['Model'] = row['Model'].replace(/-cpu/gi, '');
            }
        });
        
        performance.forEach(row => {
            if (row['Model']) {
                row['Model'] = row['Model'].replace(/-cpu/gi, '');
            }
        });
        
        resultsData = results;
        fairnessData = fairness;
        performanceData = performance;
        ethnicityData = ethnicity;
        genderData = gender;
        discriminationData = discrimination;
        
        // Auto-run analysis on load
        runAnalysisWithLayoutFix();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data files. Please ensure CSV files are available.');
    }
}

function loadCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            complete: function(results) {
                resolve(results.data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function runAnalysis() {
    if (!resultsData || !fairnessData || !performanceData) {
        showError('Data not loaded yet. Please wait...');
        return;
    }
    
    const sortMethod = document.getElementById('sort-method').value;
    
    try {
        // Sort results table
        const sortedResults = sortResultsTable(resultsData, sortMethod);
        
        // Create fairness vs accuracy plot
        createFairnessVsAccuracyPlot();
        
        // Create fairness ranking table
        createFairnessRankingTable();
        
        // Create discrimination ranking plots
        createGenderRankingPlot(sortedResults);
        createEthnicityRankingPlot(sortedResults);
        
        // Analyze discrimination patterns
        analyzeDiscriminationPatterns(sortedResults);
        
        // Generate conclusion
        generateConclusion(sortedResults);
        
        // Display sorted results table
        displayResultsTable(sortedResults);
        
    } catch (error) {
        console.error('Error during analysis:', error);
        showError('Analysis failed: ' + error.message);
    }
}

function sortResultsTable(data, sortBy) {
    const sortedData = [...data];
    
    if (sortBy === 'accuracy') {
        sortedData.sort((a, b) => {
            const accuracyA = parseFloat(a['Accuracy Global'].replace('%', ''));
            const accuracyB = parseFloat(b['Accuracy Global'].replace('%', ''));
            return accuracyB - accuracyA;
        });
    } else {
        sortedData.sort((a, b) => {
            return parseFloat(b['Discrimination Global Score']) - parseFloat(a['Discrimination Global Score']);
        });
    }
    
    // Add rank
    sortedData.forEach((row, index) => {
        row['Rank'] = index + 1;
    });
    
    return sortedData;
}

function createFairnessVsAccuracyPlot() {
    // Clear previous content
    document.getElementById('fairness-plot').innerHTML = '';
    
    // Merge fairness and performance data
    const mergedData = fairnessData.map(fairnessRow => {
        const performanceRow = performanceData.find(p => p.Model === fairnessRow.Model);
        if (performanceRow) {
            const normalizedFairness = parseFloat(fairnessRow.Fairness_Score) / 100.0;
            return {
                model: fairnessRow.Model,
                performance: parseFloat(performanceRow.Performance_Score),
                fairness: parseFloat(fairnessRow.Fairness_Score),
                squaredFairness: Math.pow(normalizedFairness, 2),
                normalizedFairness: normalizedFairness
            };
        }
        return null;
    }).filter(row => row !== null);
    
    const trace = {
        x: mergedData.map(d => d.performance),
        y: mergedData.map(d => d.squaredFairness),
        mode: 'markers+text',
        type: 'scatter',
        text: mergedData.map(d => d.model),
        textposition: 'top center',
        marker: {
            size: 12,
            color: mergedData.map(d => d.normalizedFairness),
            colorscale: [[0, 'red'], [1, 'blue']],
            colorbar: {
                title: 'Original Fairness Score'
            },
            line: {
                color: 'white',
                width: 1
            }
        }
    };
    
    const layout = {
        title: 'Model Accuracy vs Fairness Score (Squared Scale for Better Dispersion)',
        xaxis: {
            title: 'Accuracy Score (%)',
            range: [0, 100]
        },
        yaxis: {
            title: 'Fairness² - Better Dispersion',
            range: [0, 1.05],
            tickvals: [0, Math.pow(0.5, 2), Math.pow(0.8, 2), Math.pow(0.9, 2), Math.pow(0.95, 2), 1.0],
            ticktext: ['0%', '50%', '80%', '90%', '95%', '100%']
        },
        height: 1000,
        shapes: [
            // Acceptable Fairness zone
            {
                type: 'rect',
                x0: 0, y0: Math.pow(0.95, 2), x1: 100, y1: 1.0,
                fillcolor: 'lightblue',
                opacity: 0.3,
                layer: 'below',
                line: { width: 0 }
            },
            // Acceptable Accuracy zone
            {
                type: 'rect',
                x0: 90, y0: 0, x1: 100, y1: 1.0,
                fillcolor: 'lightblue',
                opacity: 0.3,
                layer: 'below',
                line: { width: 0 }
            },
            // Fairness threshold line
            {
                type: 'line',
                x0: 0, y0: Math.pow(0.95, 2), x1: 100, y1: Math.pow(0.95, 2),
                line: { color: 'lightblue', width: 2, dash: 'dash' }
            },
            // Accuracy threshold line
            {
                type: 'line',
                x0: 90, y0: 0, x1: 90, y1: 1.0,
                line: { color: 'lightblue', width: 2, dash: 'dash' }
            }
        ],
        annotations: [
            {
                x: 95, y: -0.05,
                xref: 'x', yref: 'paper',
                text: 'Acceptable Accuracy (90-100%)',
                showarrow: false,
                font: { size: 10, color: 'blue' },
                bgcolor: 'rgba(173, 216, 230, 0.8)',
                bordercolor: 'blue',
                borderwidth: 1
            },
            {
                x: -0.15, y: (Math.pow(0.95, 2) + 1.0) / 2,
                xref: 'paper', yref: 'y',
                text: 'Acceptable<br>Fairness<br>(95-100%)',
                showarrow: false,
                font: { size: 10, color: 'blue' },
                bgcolor: 'rgba(173, 216, 230, 0.8)',
                bordercolor: 'blue',
                borderwidth: 1,
                xanchor: 'center'
            }
        ]
    };
    
    Plotly.newPlot('fairness-plot', [trace], layout, {responsive: true});
}

function createFairnessRankingTable() {
    // Clear previous content
    document.getElementById('fairness-table').innerHTML = '';
    
    // Merge fairness and performance data, filtering out empty models
    const mergedData = fairnessData
        .filter(fairnessRow => fairnessRow.Model && fairnessRow.Model.trim() !== '') // Filter empty models
        .map(fairnessRow => {
            const performanceRow = performanceData.find(p => p.Model === fairnessRow.Model);
            if (performanceRow) {
                return {
                    model: fairnessRow.Model,
                    fairnessScore: Math.round(parseFloat(fairnessRow.Fairness_Score)),
                    performanceScore: Math.round(parseFloat(performanceRow.Performance_Score)),
                    fairnessRank: parseInt(fairnessRow.Rank),
                    performanceRank: parseInt(performanceRow.Rank)
                };
            }
            return null;
        }).filter(row => row !== null);
    
    // Calculate performance threshold
    const performanceScores = mergedData.map(d => d.performanceScore);
    const performanceThreshold = calculatePercentile(performanceScores, 100 - TOP_PERFORMANCE_THRESHOLD);
    
    // Add performance tier
    mergedData.forEach(row => {
        row.topPerformer = row.performanceScore >= performanceThreshold ? 'Yes' : 'No';
    });
    
    // Sort by top performers first, then by fairness score
    const topPerformers = mergedData.filter(row => row.topPerformer === 'Yes')
        .sort((a, b) => b.fairnessScore - a.fairnessScore);
    const others = mergedData.filter(row => row.topPerformer === 'No')
        .sort((a, b) => b.fairnessScore - a.fairnessScore);
    
    // Assign final ranks
    topPerformers.forEach((row, index) => row.finalRank = index + 1);
    others.forEach((row, index) => row.finalRank = topPerformers.length + index + 1);
    
    const finalData = [...topPerformers, ...others];
    
    displayTable('fairness-table', finalData, [
        { key: 'finalRank', header: 'Final Rank' },
        { key: 'model', header: 'Model' },
        { key: 'fairnessScore', header: 'Fairness Score' },
        { key: 'performanceScore', header: 'Accuracy Score (%)' },
        { key: 'topPerformer', header: `Accuracy Top ${TOP_PERFORMANCE_THRESHOLD}%` },
        { key: 'fairnessRank', header: 'Fairness Rank' },
        { key: 'performanceRank', header: 'Accuracy Rank' }
    ]);
}

function createGenderRankingPlot(data) {
    // Clear previous content
    document.getElementById('gender-plot').innerHTML = '';
    
    const genderColumn = findColumn(data, 'Gender', 'Score');
    if (!genderColumn) {
        document.getElementById('gender-plot').innerHTML = '<div class="no-data-message">No Gender discrimination data available</div>';
        return;
    }
    
    const sortedData = data.filter(row => row[genderColumn])
        .sort((a, b) => parseFloat(a[genderColumn]) - parseFloat(b[genderColumn]))
        .slice(0, 20);
    
    const trace = {
        x: sortedData.map(row => Math.round(parseFloat(row[genderColumn]))),
        y: sortedData.map(row => row['Model Name']),
        type: 'bar',
        orientation: 'h',
        marker: {
            color: sortedData.map((row, index) => {
                const normalized = index / (sortedData.length - 1);
                const red = Math.floor(255 * normalized);
                const blue = Math.floor(255 * (1 - normalized));
                return `rgba(${red}, 0, ${blue}, 0.8)`;
            })
        },
        text: sortedData.map(row => Math.round(parseFloat(row[genderColumn]))),
        textposition: 'outside'
    };
    
    const layout = {
        title: 'Top 20 Models by Gender Discrimination Score',
        xaxis: { title: 'Gender Discrimination Score' },
        yaxis: { title: 'Model Name' },
        height: 600
    };
    
    Plotly.newPlot('gender-plot', [trace], layout, {responsive: true});
}

function createEthnicityRankingPlot(data) {
    // Clear previous content
    document.getElementById('ethnicity-plot').innerHTML = '';
    
    const ethnicityColumn = findColumn(data, 'Ethnicity', 'Score');
    if (!ethnicityColumn) {
        document.getElementById('ethnicity-plot').innerHTML = '<div class="no-data-message">No Ethnicity discrimination data available</div>';
        return;
    }
    
    const sortedData = data.filter(row => row[ethnicityColumn])
        .sort((a, b) => parseFloat(a[ethnicityColumn]) - parseFloat(b[ethnicityColumn]))
        .slice(0, 20);
    
    const trace = {
        x: sortedData.map(row => Math.round(parseFloat(row[ethnicityColumn]))),
        y: sortedData.map(row => row['Model Name']),
        type: 'bar',
        orientation: 'h',
        marker: {
            color: sortedData.map((row, index) => {
                const normalized = index / (sortedData.length - 1);
                const red = Math.floor(255 * normalized);
                const blue = Math.floor(255 * (1 - normalized));
                return `rgba(${red}, 0, ${blue}, 0.8)`;
            })
        },
        text: sortedData.map(row => Math.round(parseFloat(row[ethnicityColumn]))),
        textposition: 'outside'
    };
    
    const layout = {
        title: 'Top 20 Models by Ethnicity Discrimination Score',
        xaxis: { title: 'Ethnicity Discrimination Score' },
        yaxis: { title: 'Model Name' },
        height: 600
    };
    
    Plotly.newPlot('ethnicity-plot', [trace], layout, {responsive: true});
}

function analyzeDiscriminationPatterns(data) {
    // Clear previous content
    document.getElementById('discrimination-plots').innerHTML = '';
    
    if (!ethnicityData || !genderData || !discriminationData) {
        document.getElementById('discrimination-plots').innerHTML = `
            <div class="analysis-placeholder">
                <p>Discrimination pattern data not available.</p>
                <p>Please ensure ethnicity.csv, gender.csv, and discrimination.csv files are loaded.</p>
            </div>
        `;
        return;
    }
    
    // Create the discrimination patterns visualization
    createDiscriminationPatternsVisualization();
}

function createDiscriminationPatternsVisualization() {
    const container = document.getElementById('discrimination-plots');
    
    // Create container for both plots
    container.innerHTML = `
        <div class="pattern-analysis">
            <h3>Analysis of Models in Top ${Math.floor(TOP_PERCENTILE_ACCURACY * 100)}% Accuracy AND Top ${Math.floor(TOP_PERCENTILE_DISCRIMINATION * 100)}% Discrimination</h3>
            <div class="patterns-grid">
                <div class="pattern-section">
                    <h4>Ethnicity Group Marginalization Patterns</h4>
                    <div id="ethnicity-pattern-plot" style="width: 100%; height: 400px;"></div>
                    <div class="pattern-description">
                        <p><strong>Analysis:</strong> ${ethnicityData[0]?.Analysis || 'Top performing but highly biased models'}</p>
                        <p><strong>Total Models Analyzed:</strong> ${ethnicityData[0]?.Total_Models || 6}</p>
                    </div>
                </div>
                <div class="pattern-section">
                    <h4>Gender Group Marginalization Patterns</h4>
                    <div id="gender-pattern-plot" style="width: 100%; height: 400px;"></div>
                    <div class="pattern-description">
                        <p><strong>Analysis:</strong> ${genderData[0]?.Analysis || 'Top performing but highly biased models'}</p>
                        <p><strong>Total Models Analyzed:</strong> ${genderData[0]?.Total_Models || 6}</p>
                    </div>
                </div>
            </div>
            <div class="pattern-insights">
                <h4>Key Insights:</h4>
                <ul>
                    <li><strong>Ethnicity:</strong> ${getEthnicityInsights()}</li>
                    <li><strong>Gender:</strong> ${getGenderInsights()}</li>
                </ul>
            </div>
        </div>
    `;
    
    // Create ethnicity pattern plot
    createEthnicityPatternPlot();
    
    // Create gender pattern plot
    createGenderPatternPlot();
}

function createCompleteGenderData() {
    if (!discriminationData || !genderData) return [];
    
    // Get all unique genders from discrimination.csv
    const allGenders = [...new Set(discriminationData.map(row => row.Gender).filter(gender => gender && gender.trim() !== ''))];
    
    // Create complete gender data
    const completeGenderData = [];
    
    allGenders.forEach(gender => {
        // Check if this gender exists in gender.csv
        const existingGender = genderData.find(row => row.Group === gender);
        
        if (existingGender) {
            // Use data from gender.csv
            completeGenderData.push(existingGender);
        } else {
            // Create entry with 0% for missing genders
            const totalModels = genderData[0]?.Total_Models || 6;
            completeGenderData.push({
                Group: gender,
                Percentage: "0.0",
                Count: "0",
                Total_Models: totalModels,
                Bar_Position: completeGenderData.length,
                Color: "#D3D3D3", // Gray color for 0% groups
                Graph_Type: "Horizontal Bar Chart",
                Analysis: `Top ${Math.floor(TOP_PERCENTILE_ACCURACY * 100)}% Accurate AND Top ${Math.floor(TOP_PERCENTILE_DISCRIMINATION * 100)}% Biased Models`,
                Accuracy_Percentile: "20",
                Discrimination_Percentile: "40",
                Description: `${gender} gender group marginalized in 0 of ${totalModels} high-performing & high-bias models (0.0%)`
            });
        }
    });
    
    return completeGenderData;
}

function createCompleteEthnicityData() {
    if (!discriminationData || !ethnicityData) return [];
    
    // Get all unique ethnicities from discrimination.csv
    const allEthnicities = [...new Set(discriminationData.map(row => row.Ethnicity).filter(ethnicity => ethnicity && ethnicity.trim() !== ''))];
    
    // Create complete ethnicity data
    const completeEthnicityData = [];
    
    allEthnicities.forEach(ethnicity => {
        // Check if this ethnicity exists in ethnicity.csv
        const existingEthnicity = ethnicityData.find(row => row.Group === ethnicity);
        
        if (existingEthnicity) {
            // Use data from ethnicity.csv
            completeEthnicityData.push(existingEthnicity);
        } else {
            // Create entry with 0% for missing ethnicities
            const totalModels = ethnicityData[0]?.Total_Models || 6;
            completeEthnicityData.push({
                Group: ethnicity,
                Percentage: "0.0",
                Count: "0",
                Total_Models: totalModels,
                Bar_Position: completeEthnicityData.length,
                Color: "#D3D3D3", // Gray color for 0% groups
                Graph_Type: "Horizontal Bar Chart",
                Analysis: `Top ${Math.floor(TOP_PERCENTILE_ACCURACY * 100)}% Accurate AND Top ${Math.floor(TOP_PERCENTILE_DISCRIMINATION * 100)}% Biased Models`,
                Accuracy_Percentile: "20",
                Discrimination_Percentile: "40",
                Description: `${ethnicity} ethnicity group marginalized in 0 of ${totalModels} high-performing & high-bias models (0.0%)`
            });
        }
    });
    
    return completeEthnicityData;
}

function createEthnicityPatternPlot() {
    if (!ethnicityData || ethnicityData.length === 0 || !discriminationData) return;
    
    // Get complete ethnicity data including 0% groups
    const completeData = createCompleteEthnicityData();
    
    // Filter out rows with empty Group names
    const filteredData = completeData.filter(row => row.Group && row.Group.trim() !== '');
    
    const trace = {
        y: filteredData.map(row => parseFloat(row.Percentage)),
        x: filteredData.map(row => row.Group),
        type: 'bar',
        orientation: 'v',
        marker: {
            color: filteredData.map(row => row.Color || '#FF6B6B'),
            opacity: 0.8
        },
        text: filteredData.map(row => `${row.Percentage}% (${row.Count}/${row.Total_Models})`),
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>' +
                      'Marginalization Rate: %{y}%<br>' +
                      'Count: %{customdata.count}/%{customdata.total}<br>' +
                      '%{customdata.description}<br>' +
                      '<extra></extra>',
        customdata: filteredData.map(row => ({
            count: row.Count,
            total: row.Total_Models,
            description: row.Description
        }))
    };
    
    const layout = {
        title: 'Ethnicity Group Marginalization in High-Performance, High-Bias Models',
        yaxis: {
            title: 'Percentage of Models Showing Bias (%)',
            range: [0, 100]
        },
        xaxis: {
            title: 'Ethnicity Groups'
        },
        margin: { l: 80, r: 50, t: 80, b: 120 },
        height: 400
    };
    
    Plotly.newPlot('ethnicity-pattern-plot', [trace], layout, {responsive: true});
}

function createGenderPatternPlot() {
    if (!genderData || genderData.length === 0 || !discriminationData) return;
    
    // Get complete gender data including 0% groups
    const completeData = createCompleteGenderData();
    
    // Filter out rows with empty Group names
    const filteredData = completeData.filter(row => row.Group && row.Group.trim() !== '');
    
    const trace = {
        y: filteredData.map(row => parseFloat(row.Percentage)),
        x: filteredData.map(row => row.Group),
        type: 'bar',
        orientation: 'v',
        marker: {
            color: filteredData.map(row => row.Color || '#4ECDC4'),
            opacity: 0.8
        },
        text: filteredData.map(row => `${row.Percentage}% (${row.Count}/${row.Total_Models})`),
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>' +
                      'Marginalization Rate: %{y}%<br>' +
                      'Count: %{customdata.count}/%{customdata.total}<br>' +
                      '%{customdata.description}<br>' +
                      '<extra></extra>',
        customdata: filteredData.map(row => ({
            count: row.Count,
            total: row.Total_Models,
            description: row.Description
        }))
    };
    
    const layout = {
        title: 'Gender Group Marginalization in High-Performance, High-Bias Models',
        yaxis: {
            title: 'Percentage of Models Showing Bias (%)',
            range: [0, 100]
        },
        xaxis: {
            title: 'Gender Groups'
        },
        margin: { l: 80, r: 50, t: 80, b: 120 },
        height: 400
    };
    
    Plotly.newPlot('gender-pattern-plot', [trace], layout, {responsive: true});
}

function getEthnicityInsights() {
    if (!ethnicityData || ethnicityData.length === 0) return "No data available";
    
    const completeData = createCompleteEthnicityData();
    
    const maxBias = completeData.reduce((max, row) => 
        parseFloat(row.Percentage) > parseFloat(max.Percentage) ? row : max
    );
    
    const minBias = completeData.reduce((min, row) => 
        parseFloat(row.Percentage) < parseFloat(min.Percentage) ? row : min
    );
    
    return `People in the group ${maxBias.Group} show highest bias rate (${maxBias.Percentage}%), while people in the group ${minBias.Group} show lowest (${minBias.Percentage}%)`;
}

function getGenderInsights() {
    if (!genderData || genderData.length === 0) return "No data available";
    
    const completeData = createCompleteGenderData();
    
    const maxBias = completeData.reduce((max, row) => 
        parseFloat(row.Percentage) > parseFloat(max.Percentage) ? row : max
    );
    
    const minBias = completeData.reduce((min, row) => 
        parseFloat(row.Percentage) < parseFloat(min.Percentage) ? row : min
    );
    
    return `People in the group ${maxBias.Group} show highest bias rate (${maxBias.Percentage}%), while people in the group ${minBias.Group} show lowest (${minBias.Percentage}%)`;
}

function generateConclusion(data) {
    // Clear previous content
    document.getElementById('conclusion-section').innerHTML = '';
    
    const bestModel = findBestModel(data);
    
    let conclusion = `
        <div class="conclusion-content">
            <h3>🎯 Conclusion & Recommendation</h3>
    `;
    
    if (bestModel) {
        const accuracy = parseFloat(bestModel['Accuracy Global'].replace('%', ''));
        conclusion += `
            <p><strong>Recommended Model:</strong> <strong>${bestModel['Model Name']}</strong></p>
            <ul>
                <li><strong>Accuracy:</strong> ${accuracy.toFixed(1)}%</li>
                <li><strong>Discrimination Score:</strong> ${parseFloat(bestModel['Discrimination Global Score']).toFixed(2)}</li>
                <li><strong>Ranking:</strong> Among the least biased models (bottom 25% discrimination scores), this model achieves the highest accuracy.</li>
            </ul>
        `;
    }
    
    conclusion += `
            <h4>Analysis Summary:</h4>
            <ul>
                <li><strong>Total Models Analyzed:</strong> ${data.length}</li>
                <li><strong>Top ${Math.floor(TOP_PERCENTILE_ACCURACY * 100)}% Most Accurate Models:</strong> ${Math.floor(data.length * TOP_PERCENTILE_ACCURACY)}</li>
                <li><strong>Top ${Math.floor(TOP_PERCENTILE_DISCRIMINATION * 100)}% Most Biased Models:</strong> ${Math.floor(data.length * TOP_PERCENTILE_DISCRIMINATION)}</li>
            </ul>
            <p>This recommendation balances performance with fairness by selecting the most accurate model from among those with the lowest discrimination scores.</p>
        </div>
    `;
    
    document.getElementById('conclusion-section').innerHTML = conclusion;
}

function findBestModel(data) {
    // Find models in bottom quartile of discrimination
    const discriminationScores = data.map(row => parseFloat(row['Discrimination Global Score']));
    const q1Threshold = calculatePercentile(discriminationScores, 25);
    
    const lowBiasModels = data.filter(row => 
        parseFloat(row['Discrimination Global Score']) <= q1Threshold
    );
    
    if (lowBiasModels.length === 0) return null;
    
    // Find highest accuracy among low bias models
    return lowBiasModels.reduce((best, current) => {
        const bestAccuracy = parseFloat(best['Accuracy Global'].replace('%', ''));
        const currentAccuracy = parseFloat(current['Accuracy Global'].replace('%', ''));
        return currentAccuracy > bestAccuracy ? current : best;
    });
}

function displayResultsTable(data) {
    // Clear previous content
    document.getElementById('rankings-table').innerHTML = '';
    
    // Filter out rows with empty Model Names
    const filteredData = data.filter(row => row['Model Name'] && row['Model Name'].trim() !== '');
    
    const columns = [
        { key: 'Rank', header: 'Rank' },
        { key: 'Model Name', header: 'Model Name' },
        { key: 'Accuracy Global', header: 'Accuracy Global' },
        { key: 'Discrimination Global Score', header: 'Discrimination Global Score' }
    ];
    
    // Add any discrimination columns that exist, but exclude any with "Legal" or "legal"
    const discriminationCols = Object.keys(filteredData[0] || {}).filter(key => 
        key.includes('Discrimination') && 
        key.includes('Score') && 
        !key.includes('Global') &&
        !key.toLowerCase().includes('legal')
    );
    
    discriminationCols.forEach(col => {
        columns.push({ key: col, header: col });
    });
    
    displayTable('rankings-table', filteredData, columns);
}

function displayTable(containerId, data, columns) {
    let html = '<table class="results-table"><thead><tr>';
    
    columns.forEach(col => {
        html += `<th>${col.header}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    data.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
            const value = row[col.key] || '';
            html += `<td>${value}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    document.getElementById(containerId).innerHTML = html;
}

// Utility functions
function findColumn(data, ...keywords) {
    const columns = Object.keys(data[0] || {});
    return columns.find(col => 
        keywords.every(keyword => col.includes(keyword))
    );
}

function calculatePercentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function showError(message) {
    const errorHtml = `<div class="error-message">${message}</div>`;
    document.getElementById('rankings-table').innerHTML = errorHtml;
    document.getElementById('fairness-plot').innerHTML = errorHtml;
    document.getElementById('fairness-table').innerHTML = errorHtml;
    document.getElementById('gender-plot').innerHTML = errorHtml;
    document.getElementById('ethnicity-plot').innerHTML = errorHtml;
    document.getElementById('discrimination-plots').innerHTML = errorHtml;
    document.getElementById('conclusion-section').innerHTML = errorHtml;
}

// Add this function to fix layout issues
function fixLayoutIssues() {
    // Force Plotly to resize
    const plotIds = ['fairness-plot', 'gender-plot', 'ethnicity-plot', 'ethnicity-pattern-plot', 'gender-pattern-plot'];
    plotIds.forEach(id => {
        const element = document.getElementById(id);
        if (element && element.firstChild) {
            Plotly.Plots.resize(element);
        }
    });
    
    // Ensure proper spacing
    const sections = document.querySelectorAll('.glass-panel');
    sections.forEach((section, index) => {
        section.style.marginBottom = '3rem';
        section.style.position = 'relative';
        section.style.zIndex = index + 1;
    });
}

// Call this function after creating plots
function runAnalysisWithLayoutFix() {
    runAnalysis();
    setTimeout(fixLayoutIssues, 500); // Give plots time to render
}

// Also call on window resize
window.addEventListener('resize', () => {
    setTimeout(fixLayoutIssues, 200);
});
