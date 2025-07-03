class AnalysisTool {
    constructor(config) {
        this.type = config.type;
        this.card = document.getElementById(config.cardId);
        
        this.sortColumn = -1;
        this.sortDirection = 'asc';

        this.newFilesInput = document.getElementById(config.newInputId);
        this.oldFilesInput = document.getElementById(config.oldInputId);
        
        this.newFileCountSpan = document.getElementById(config.newCountId);
        this.oldFileCountSpan = document.getElementById(config.oldCountId);
        
        this.runButton = this.card.querySelector(`.run-button[data-type="${this.type}"]`);
        this.generateListButton = this.card.querySelector(`.generate-list-btn[data-type="${this.type}"]`);
        this.reportOutputArea = document.getElementById('report-output-area');
        
        this.TOLERANCE = 0.01;
        
        // Configure based on analysis type
        switch (this.type) {
            case 'jointtarget':
                this.robotKeyRegex = /(Z\d{2}\.\d{1}_\d{1,3}_?R\d{2})/;
                this.targetRegex = /^\s*(?:CONST|PERS)\s+jointtarget\s+([a-zA-Z0-9_]+)\s*:=\s*(.*?);/gm;
                this.fileExt = '.mod';
                this.filePrefix = 'path_';
                break;
            case 'robtarget':
                this.robotKeyRegex = /(Z\d{2}\.\d{1}_\d{1,3}_?R\d{2})/;
                this.targetRegex = /^\s*(?:CONST|PERS)\s+robtarget\s+([a-zA-Z0-9_]+)\s*:=\s*(.*?);/gm;
                this.fileExt = '.mod';
                this.filePrefix = 'path_';
                break;
            case 'tooldata':
                this.robotKeyRegex = null; // Match by filename for SYS
                this.targetRegex = /^\s*PERS\s+tooldata\s+(t_p[a-zA-Z0-9_]+)\s*:=\s*(.*?);/gm;
                this.fileExt = '.sys';
                this.filePrefix = null; // Custom logic will be used instead of a single prefix
                break;
        }

        // Attach event listeners if the buttons are not disabled
        if (this.runButton && !this.runButton.disabled) {
            this.runButton.addEventListener('click', () => this.runComparison());
        }
        if (this.generateListButton && !this.generateListButton.disabled) {
            this.generateListButton.addEventListener('click', () => this.generateFileList());
        }
        
        if (this.newFilesInput) {
            this.newFilesInput.addEventListener('change', () => this.updateFileCount(this.newFilesInput, this.newFileCountSpan));
        }
        if (this.oldFilesInput) {
            this.oldFilesInput.addEventListener('change', () => this.updateFileCount(this.oldFilesInput, this.oldFileCountSpan));
        }
    }

    updateFileCount(inputElement, countSpan) {
        const fileList = inputElement.files;
        if (!fileList || !countSpan) return;

        let validFileCount = 0;
        for (const file of fileList) {
            const fileNameLower = file.name.toLowerCase();
            if (fileNameLower.endsWith(this.fileExt)) {
                // Specific filter for tooldata (SYS files)
                if (this.type === 'tooldata') {
                    if (!(fileNameLower.startsWith('all_') || fileNameLower.startsWith('all_data'))) {
                        continue; // Skip if not starting with the required prefixes
                    }
                } 
                // Generic filter for other types
                else if (this.filePrefix && !fileNameLower.startsWith(this.filePrefix)) {
                    continue;
                }
                validFileCount++;
            }
        }

        if (validFileCount > 0) {
            countSpan.textContent = `(${validFileCount} ${this.fileExt} file${validFileCount > 1 ? 's' : ''} found)`;
        } else {
            countSpan.textContent = `(No valid ${this.fileExt} files found)`;
        }
    }

    getBasePath(fileList) {
        if (!fileList || fileList.length === 0) return "N/A";
        if (fileList[0].webkitRelativePath) {
            return fileList[0].webkitRelativePath.split('/')[0] || "(Root)";
        }
        return fileList[0].name;
    }

    /**
     * Generates a side-by-side CSV file list comparing new and old files.
     * Matched files are listed first, followed by unmatched new files, then unmatched old files.
     */
    async generateFileList() {
        const newFiles = this.newFilesInput.files;
        const oldFiles = this.oldFilesInput.files;
        
        if (newFiles.length === 0 && oldFiles.length === 0) {
            alert('Please select at least one folder to generate a file list.');
            return;
        }

        const newFilesMap = this.processFileList(newFiles);
        const oldFilesMap = this.processFileList(oldFiles);

        // Use a mutable map for old files to track matches
        const oldFilesMutableMap = new Map(oldFilesMap);

        const matchedRows = [];
        const newOnlyRows = [];
        const oldOnlyRows = [];

        // Process new files to find matches and new-only files
        newFilesMap.forEach((newFile, key) => {
            if (oldFilesMutableMap.has(key)) {
                const oldFile = oldFilesMutableMap.get(key);
                // Matched file row
                matchedRows.push(['New', key, newFile.webkitRelativePath, 'Old', key, oldFile.webkitRelativePath]);
                oldFilesMutableMap.delete(key); // Remove from map to find old-only files later
            } else {
                // New file only row
                newOnlyRows.push(['New', key, newFile.webkitRelativePath, '', '', '']);
            }
        });

        // Process any remaining (unmatched) old files
        oldFilesMutableMap.forEach((oldFile, key) => {
            oldOnlyRows.push(['', '', '', 'Old', key, oldFile.webkitRelativePath]);
        });
        
        // Combine the rows in the desired order: matched, then new-only, then old-only
        const headers = [['Type', 'Robot/File Name', 'File Path', 'Type (Old)', 'Robot/File Name (Old)', 'File Path (Old)']];
        const summary = [
            [''], // Spacer row
            ['Summary'],
            ['New Files Found:', newFilesMap.size],
            ['Old Files Found:', oldFilesMap.size]
        ];
        
        const csvData = [...headers, ...matchedRows, ...newOnlyRows, ...oldOnlyRows, ...summary];

        const csvString = csvData.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
        
        this.downloadCsv(csvString, `${this.type}_file_list`);
    }

    downloadCsv(csvString, baseName) {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute('download', `${baseName}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async runComparison() {
        this.runButton.disabled = true;
        this.runButton.textContent = 'Processing...';
        this.reportOutputArea.innerHTML = `<div class="report-section"><p>Reading and processing files...</p></div>`;

        try {
            const newFiles = this.newFilesInput.files;
            const oldFiles = this.oldFilesInput.files;

            if (newFiles.length === 0 || oldFiles.length === 0) {
                throw new Error('Please select both a "New" and an "Old" file/folder.');
            }

            const newBasePath = this.getBasePath(newFiles);
            const oldBasePath = this.getBasePath(oldFiles);

            const newFilesMap = this.processFileList(newFiles);
            const oldFilesMap = this.processFileList(oldFiles);

            if (newFilesMap.size === 0 || oldFilesMap.size === 0) {
                throw new Error(`No valid files found. Please check your selection.`);
            }

            const [newFileContents, oldFileContents] = await Promise.all([
                this.readAllFiles(newFilesMap),
                this.readAllFiles(oldFilesMap)
            ]);

            let reportRowsHtml = '';
            const itemNames = new Set();
            const variableNames = new Set();

            for (const [itemName, newContent] of newFileContents.entries()) {
                if (oldFileContents.has(itemName)) {
                    const oldContent = oldFileContents.get(itemName);
                    const comparisonResult = this.generateComparisonRows(newContent, oldContent, itemName);
                    if (comparisonResult.html) {
                        reportRowsHtml += comparisonResult.html;
                        itemNames.add(itemName);
                        comparisonResult.variableNames.forEach(name => variableNames.add(name));
                    }
                }
            }
            
            this.renderReport(reportRowsHtml, itemNames, Array.from(variableNames), newBasePath, oldBasePath);

        } catch (error) {
            this.reportOutputArea.innerHTML = `<div class="report-section"><p style="color: var(--status-deleted);"><strong>Error:</strong> ${error.message}</p></div>`;
        } finally {
            this.runButton.disabled = false;
            this.runButton.textContent = 'Generate Report';
        }
    }

    renderReport(rowsHtml, itemNames, variableNames, newBasePath = '', oldBasePath = '') {
        if (!rowsHtml) {
            this.reportOutputArea.innerHTML = `<div class="report-section"><h2>${this.type} Comparison Complete</h2><p>No significant differences found.</p></div>`;
            return;
        }

        const isSysFile = this.type === 'tooldata';
        const itemHeader = isSysFile ? 'SYS File' : 'Robot Number';
        const filterPlaceholder = isSysFile ? 'Filter by File Name...' : 'Filter by Robot Number...';
        
        const itemDatalistId = `${this.type}-item-names`;
        let itemDatalistHtml = `<datalist id="${itemDatalistId}">`;
        itemNames.forEach(name => {
            itemDatalistHtml += `<option value="${name}"></option>`;
        });
        itemDatalistHtml += `</datalist>`;
        
        const varDatalistId = `${this.type}-variable-names`;
        let varDatalistHtml = `<datalist id="${varDatalistId}">`;
        variableNames.forEach(name => {
            varDatalistHtml += `<option value="${name}"></option>`;
        });
        varDatalistHtml += `</datalist>`;

        let extraHeaders = '';
        if (this.type === 'jointtarget') {
            const jAxisNames = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
            const eaxNames = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
            
            jAxisNames.forEach(name => { extraHeaders += `<th class="sortable">New ${name}</th><th class="sortable">Old ${name}</th>`; });
            eaxNames.forEach(name => { extraHeaders += `<th class="sortable">New ${name}</th><th class="sortable">Old ${name}</th>`; });
        }

        const reportHtml = `
            <div class="report-section">
                <h2>${this.type} Comparison Report</h2>
                <div class="report-source">
                    <div class="report-source-item">
                        <span><strong>New Source:</strong> ${this.escapeHtml(newBasePath)}</span>
                        <button class="copy-path-btn" data-path="${this.escapeHtml(newBasePath)}">Copy</button>
                    </div>
                    <div class="report-source-item">
                        <span><strong>Old Source:</strong> ${this.escapeHtml(oldBasePath)}</span>
                        <button class="copy-path-btn" data-path="${this.escapeHtml(oldBasePath)}">Copy</button>
                    </div>
                </div>
                <div class="report-header">
                    <div class="report-filter">
                        <input type="text" id="${this.type}-item-filter" placeholder="${filterPlaceholder}" list="${itemDatalistId}">
                        <input type="text" id="${this.type}-variable-filter" placeholder="Filter by Variable Name..." list="${varDatalistId}">
                        ${itemDatalistHtml}
                        ${varDatalistHtml}
                    </div>
                    <button id="${this.type}-export-excel">Export to Excel</button>
                </div>
                <div class="table-container">
                    <table id="${this.type}-report-table" style="table-layout: auto;">
                        <thead>
                            <tr>
                                <th class="sortable" style="width: 5%;">Status</th>
                                <th class="sortable" style="width: 10%;">${itemHeader}</th>
                                <th class="sortable" style="width: 10%;">Variable Name</th>
                                <th>New Value</th>
                                <th>Old Value</th>
                                ${extraHeaders}
                                <th class="sortable line-num-col">New Ln</th>
                                <th class="sortable line-num-col">Old Ln</th>
                            </tr>
                        </thead>
                        <tbody id="${this.type}-report-body">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.reportOutputArea.innerHTML = reportHtml;
        
        document.getElementById(`${this.type}-item-filter`).addEventListener('input', () => this.filterReport());
        document.getElementById(`${this.type}-variable-filter`).addEventListener('input', () => this.filterReport());
        
        // Correctly attach the event listener to the new "Export to Excel" button
        document.getElementById(`${this.type}-export-excel`).addEventListener('click', () => {
            // Call the global function from excel-export.js
            exportToExcel(this.type, `${this.type}_report`);
        });
        
        document.querySelectorAll(`#${this.type}-report-table .sortable`).forEach(th => {
            th.addEventListener('click', () => {
                const headerCells = Array.from(th.parentElement.children);
                const columnIndex = headerCells.indexOf(th);
                this.sortTable(columnIndex);
            });
        });

        document.querySelectorAll('.copy-path-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.dataset.path;
                navigator.clipboard.writeText(path).then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = originalText; }, 1500);
                }).catch(err => { console.error('Failed to copy path: ', err); });
            });
        });
    }

    sortTable(columnIndex) {
        const table = document.getElementById(`${this.type}-report-table`);
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const headers = table.querySelectorAll('thead th');

        const direction = (this.sortColumn === columnIndex && this.sortDirection === 'asc') ? 'desc' : 'asc';
        this.sortColumn = columnIndex;
        this.sortDirection = direction;

        rows.sort((a, b) => {
            const valA = a.cells[columnIndex].textContent.trim();
            const valB = b.cells[columnIndex].textContent.trim();
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            
            let comparison = 0;
            if (!isNaN(numA) && !isNaN(numB)) {
                comparison = numA - numB;
            } else {
                comparison = valA.localeCompare(valB);
            }
            
            return comparison * (direction === 'asc' ? 1 : -1);
        });

        headers.forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
        headers[columnIndex].classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');

        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    }

    filterReport() {
        const itemFilterValue = document.getElementById(`${this.type}-item-filter`).value.toLowerCase();
        const variableFilterValue = document.getElementById(`${this.type}-variable-filter`).value.toLowerCase();

        const rows = document.querySelectorAll(`#${this.type}-report-body tr`);
        rows.forEach(row => {
            const itemCellText = row.cells[1].textContent.toLowerCase();
            const variableCellText = row.cells[2].textContent.toLowerCase();

            const itemMatch = itemCellText.includes(itemFilterValue);
            const variableMatch = variableCellText.includes(variableFilterValue);

            row.style.display = (itemMatch && variableMatch) ? '' : 'none';
        });
    }
    
    processFileList(fileList) {
        const fileMap = new Map();
        for (const file of fileList) {
            const fileNameLower = file.name.toLowerCase();
            if (fileNameLower.endsWith(this.fileExt)) {
                // Specific filter for tooldata (SYS files)
                if (this.type === 'tooldata') {
                    if (!(fileNameLower.startsWith('all_') || fileNameLower.startsWith('all_data'))) {
                        continue; // Skip if not starting with the required prefixes
                    }
                } 
                // Generic filter for other types
                else if (this.filePrefix && !fileNameLower.startsWith(this.filePrefix)) {
                    continue;
                }

                let key = this.robotKeyRegex ? (file.webkitRelativePath.match(this.robotKeyRegex) || [])[1] : file.name;
                if (key) fileMap.set(key, file);
            }
        }
        return fileMap;
    }

    async readAllFiles(fileMap) {
        const contentMap = new Map();
        const promises = Array.from(fileMap.entries()).map(([key, file]) => 
            file.text().then(content => contentMap.set(key, content))
        );
        await Promise.all(promises);
        return contentMap;
    }

    extractTargets(fileContent) {
        const targets = [];
        let match;
        this.targetRegex.lastIndex = 0; 
        while ((match = this.targetRegex.exec(fileContent)) !== null) {
            const lines = fileContent.substring(0, match.index).split('\n');
            targets.push({ name: match[1].trim(), value: match[2].trim(), line: lines.length });
        }
        return targets;
    }
    
    parseNumbers(valueStr, isJointTarget = false) {
        const numRegex = /-?\d+(?:\.\d+)?(?:E[+-]?\d+)?/gi;
        if (isJointTarget) {
            try {
                const robaxMatch = valueStr.match(/\[\s*\[(.*?)\]/);
                const eaxMatch = valueStr.match(/,\s*\[(.*?)\]/);
                const robaxStrings = robaxMatch ? (robaxMatch[1].match(numRegex) || []) : [];
                const eaxStrings = eaxMatch ? (eaxMatch[1].match(numRegex) || []) : [];
                const createObjectArray = (stringArr) => stringArr.map(s => ({ val: parseFloat(s), str: s }));
                let robax = createObjectArray(robaxStrings);
                let eax = createObjectArray(eaxStrings);
                while (robax.length < 6) robax.push({ val: 0, str: "0" });
                while (eax.length < 6) eax.push({ val: 0, str: "0" });
                return { robax: robax.slice(0, 6), eax: eax.slice(0, 6) };
            } catch (e) {
                console.error("Could not parse jointtarget:", valueStr, e);
                const emptyArr = Array(6).fill({ val: 0, str: "0" });
                return { robax: [...emptyArr], eax: [...emptyArr] };
            }
        }
        return (valueStr.match(numRegex) || []).map(s => ({ val: parseFloat(s), str: s }));
    }

    getHighlightClass(diff) {
        const absDiff = Math.abs(diff);
        if (absDiff > 1) return 'diff-red';
        if (absDiff > 0.5) return 'diff-amber';
        if (absDiff > this.TOLERANCE) return 'diff-green';
        return '';
    }

    rebuildHtmlWithValueHighlights(valueStr, diffs) {
        let i = 0;
        return this.escapeHtml(valueStr).replace(/-?\d+(?:\.\d+)?(?:E[+-]?\d+)?/gi, (match) => {
            const diffInfo = diffs.find(d => d.index === i);
            i++;
            if (diffInfo) {
                return `<span class="${diffInfo.class}">${match}</span>`;
            }
            return match;
        });
    }

    compareAndHighlightValues(oldValStr, newValStr) {
        const isJoint = this.type === 'jointtarget';
        const isToolOrRob = this.type === 'tooldata' || this.type === 'robtarget';
        
        const oldNumsRaw = this.parseNumbers(oldValStr, isJoint);
        const newNumsRaw = this.parseNumbers(newValStr, isJoint);
        
        const oldNums = isJoint ? [...oldNumsRaw.robax, ...oldNumsRaw.eax] : oldNumsRaw;
        const newNums = isJoint ? [...newNumsRaw.robax, ...newNumsRaw.eax] : newNumsRaw;

        const diffs = [];
        let isSignificant = false;

        if (newValStr.trim() !== oldValStr.trim()) {
            isSignificant = true;
        }

        if (isSignificant && (isToolOrRob || isJoint)) {
            for (let i = 0; i < newNums.length; i++) {
                if (i >= oldNums.length) break;
                const n1 = newNums[i].val;
                const n2 = oldNums[i].val;

                if (Math.abs(n1 - n2) > this.TOLERANCE) {
                    const diffClass = this.getHighlightClass(n1 - n2);
                    if (diffClass) {
                      diffs.push({ index: i, class: diffClass });
                    }
                }
            }
        }
        
        const newHtml = isSignificant 
            ? this.rebuildHtmlWithValueHighlights(newValStr, diffs) 
            : this.escapeHtml(newValStr);

        return { isSignificant, newHtml };
    }

    generateComparisonRows(newContent, oldContent, itemName) {
        const oldTargets = this.extractTargets(oldContent);
        const newTargets = this.extractTargets(newContent);
        
        let htmlRows = '';
        const variableNames = new Set();
        const matchedOldIndices = new Set();
        const matchedNewIndices = new Set();
        const isJointTarget = this.type === 'jointtarget';

        // First pass: find identical matches to exclude them from the report
        for(let i=0; i < newTargets.length; i++) {
            for(let j=0; j < oldTargets.length; j++) {
                if (!matchedOldIndices.has(j) && newTargets[i].name === oldTargets[j].name && newTargets[i].value.trim() === oldTargets[j].value.trim()) {
                    matchedNewIndices.add(i);
                    matchedOldIndices.add(j);
                    break; 
                }
            }
        }

        // Second pass: find changed items
        for (let i = 0; i < newTargets.length; i++) {
            if (matchedNewIndices.has(i)) continue;
            for (let j = 0; j < oldTargets.length; j++) {
                if (matchedOldIndices.has(j)) continue;

                if (newTargets[i].name === oldTargets[j].name) {
                    const { isSignificant, newHtml } = this.compareAndHighlightValues(oldTargets[j].value, newTargets[i].value);
                    if (isSignificant) {
                        variableNames.add(newTargets[i].name);
                        let extraCells = '';
                        let diffAttributes = '';
                        if (isJointTarget) {
                            const newParsed = this.parseNumbers(newTargets[i].value, true);
                            const oldParsed = this.parseNumbers(oldTargets[j].value, true);
                            const allNew = [...newParsed.robax, ...newParsed.eax];
                            const allOld = [...oldParsed.robax, ...oldParsed.eax];
                            const axisNames = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

                            for(let k = 0; k < 12; k++) {
                                const diff = allNew[k].val - allOld[k].val;
                                diffAttributes += ` data-${axisNames[k]}-diff="${diff.toFixed(4)}"`;
                                const highlightClass = this.getHighlightClass(diff);
                                const newCellContent = highlightClass ? `<span class="${highlightClass}">${this.escapeHtml(allNew[k].str)}</span>` : this.escapeHtml(allNew[k].str);
                                extraCells += `<td>${newCellContent}</td><td>${this.escapeHtml(allOld[k].str)}</td>`;
                            }
                        }
                        htmlRows += `<tr${diffAttributes}>
                            <td><span class="status-changed">Changed</span></td>
                            <td>${this.escapeHtml(itemName)}</td>
                            <td>${this.escapeHtml(newTargets[i].name)}</td>
                            <td><pre>${newHtml}</pre></td>
                            <td><pre>${this.escapeHtml(oldTargets[j].value)}</pre></td>
                            ${extraCells}
                            <td class="line-num-col">${newTargets[i].line}</td>
                            <td class="line-num-col">${oldTargets[j].line}</td>
                        </tr>`;
                        matchedNewIndices.add(i);
                        matchedOldIndices.add(j);
                        break; 
                    }
                }
            }
        }
        
        // Third pass: find added items
        for (let i = 0; i < newTargets.length; i++) {
            if (!matchedNewIndices.has(i)) {
                variableNames.add(newTargets[i].name);
                let extraCells = '';
                if (isJointTarget) {
                    const newParsed = this.parseNumbers(newTargets[i].value, true);
                    const allNew = [...newParsed.robax, ...newParsed.eax];
                    allNew.forEach(item => {
                        extraCells += `<td>${this.escapeHtml(item.str)}</td><td></td>`;
                    });
                }
                htmlRows += `<tr>
                    <td><span class="status-added">Added</span></td>
                    <td>${this.escapeHtml(itemName)}</td>
                    <td>${this.escapeHtml(newTargets[i].name)}</td>
                    <td><pre>${this.escapeHtml(newTargets[i].value)}</pre></td>
                    <td></td>
                    ${extraCells}
                    <td class="line-num-col">${newTargets[i].line}</td>
                    <td class="line-num-col"></td>
                </tr>`;
            }
        }

        // Fourth pass: find deleted items
        for (let j = 0; j < oldTargets.length; j++) {
            if (!matchedOldIndices.has(j)) {
                 variableNames.add(oldTargets[j].name);
                 let extraCells = '';
                if (isJointTarget) {
                    const oldParsed = this.parseNumbers(oldTargets[j].value, true);
                    const allOld = [...oldParsed.robax, ...oldParsed.eax];
                    allOld.forEach(item => {
                        extraCells += `<td></td><td>${this.escapeHtml(item.str)}</td>`;
                    });
                }
                htmlRows += `<tr>
                    <td><span class="status-deleted">Deleted</span></td>
                    <td>${this.escapeHtml(itemName)}</td>
                    <td>${this.escapeHtml(oldTargets[j].name)}</td>
                    <td class="not-found">Not found in new file.</td>
                    <td><pre>${this.escapeHtml(oldTargets[j].value)}</pre></td>
                    ${extraCells}
                    <td class="line-num-col"></td>
                    <td class="line-num-col">${oldTargets[j].line}</td>
                </tr>`;
            }
        }

        return { html: htmlRows, variableNames: Array.from(variableNames) };
    }

    escapeHtml(text) {
        if (text === null || text === undefined) {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = text.toString();
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Configuration for the active analysis tools
    const configs = [
        { type: 'jointtarget', cardId: 'jointtarget-card', newInputId: 'jt-new-input', oldInputId: 'jt-old-input', newCountId: 'jt-new-count', oldCountId: 'jt-old-count' },
        { type: 'robtarget', cardId: 'robtarget-card', newInputId: 'rt-new-input', oldInputId: 'rt-old-input', newCountId: 'rt-new-count', oldCountId: 'rt-old-count' }
    ];

    // Initialize the main tools
    configs.forEach(config => new AnalysisTool(config));
    
    // Logic to initialize the SYSMOD analysis when its button is clicked
    const sysCard = document.getElementById('sysmod-card');
    sysCard.querySelectorAll('.sub-analysis-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Ensure the button is not disabled
            if (btn.disabled) return;

            const type = btn.dataset.type;
            if (type === 'tooldata') {
                const controls = document.getElementById(`${type}-controls`);
                if (controls) {
                    // Hide other sub-controls if any were visible
                    sysCard.querySelectorAll('.sub-controls').forEach(sc => sc.classList.remove('visible'));
                    // Show the controls for this analysis type
                    controls.classList.add('visible');
                    
                    // Initialize the AnalysisTool for tooldata
                    new AnalysisTool({
                        type: 'tooldata',
                        cardId: 'sysmod-card',
                        newInputId: 'td-new-input',
                        oldInputId: 'td-old-input',
                        newCountId: 'td-new-count',
                        oldCountId: 'td-old-count'
                    });
                }
            }
        });
    });
});
