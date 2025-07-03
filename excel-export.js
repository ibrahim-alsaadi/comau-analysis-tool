/**
 * Exports the report table to a formatted XLSX file using the ExcelJS library.
 * @param {string} type - The type of analysis (e.g., 'jointtarget').
 * @param {string} baseName - The base name for the downloaded file.
 */
async function exportToExcel(type, baseName) {
    const table = document.getElementById(`${type}-report-table`);
    if (!table) {
        alert('Error: Report table not found.');
        return;
    }

    // --- 1. Create a new Workbook and Worksheet ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report', {
        views: [{
            showGridLines: false
        }]
    });

    // --- 2. Define Headers and Columns ---
    const headerCells = Array.from(table.querySelectorAll('thead th'));
    let columns = [];

    if (type === 'jointtarget') {
        const oldValueIndex = headerCells.findIndex(th => th.textContent.trim() === 'Old Value');
        const baseHeaders = headerCells.slice(0, oldValueIndex + 1).map(th => th.textContent.trim().replace(/▲|▼/g, ''));
        
        columns = baseHeaders.map(header => ({ header: header, key: header.replace(/\s/g, ''), width: 20 }));
        
        const jAxisNames = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
        const eaxNames = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
        const diffHeaders = [...jAxisNames, ...eaxNames].map(name => `${name} Diff`);
        
        diffHeaders.forEach(header => {
            columns.push({ header: header, key: header.replace(/\s/g, ''), width: 12 });
        });
    } else {
        columns = headerCells.map(th => {
            const headerText = th.textContent.trim().replace(/▲|▼/g, '');
            return { header: headerText, key: headerText.replace(/\s/g, ''), width: 20 };
        });
    }
    worksheet.columns = columns;

    // --- 3. Add Data Rows ---
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        if (row.style.display === 'none') return;

        const cells = Array.from(row.querySelectorAll('td'));
        const rowData = {};

        if (type === 'jointtarget') {
            const oldValueIndex = headerCells.findIndex(th => th.textContent.trim() === 'Old Value');
            const baseCells = cells.slice(0, oldValueIndex + 1);
            
            baseCells.forEach((cell, i) => {
                rowData[columns[i].key] = (cell.querySelector('pre') ? cell.querySelector('pre').textContent : cell.textContent).trim();
            });

            if (row.querySelector('.status-changed')) {
                const axisNames = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
                axisNames.forEach((axis, i) => {
                    const diffValue = parseFloat(row.dataset[`${axis}Diff`] || 0);
                    rowData[columns[oldValueIndex + 1 + i].key] = diffValue;
                });
            }
        } else {
            cells.forEach((cell, i) => {
                rowData[columns[i].key] = (cell.querySelector('pre') ? cell.querySelector('pre').textContent : cell.textContent).trim();
            });
        }
        worksheet.addRow(rowData);
    });

    // --- 4. Apply Conditional Formatting ---
    if (type === 'jointtarget') {
        const startDiffColKey = 'J1Diff';
        const startCol = columns.findIndex(c => c.key === startDiffColKey) + 1;

        if (startCol > 0) {
            const range = `${worksheet.getColumn(startCol).letter}2:${worksheet.getColumn(startCol + 11).letter}${worksheet.rowCount}`;
            
            // Red Rule (Priority 1)
            worksheet.addConditionalFormatting({
                ref: range,
                priority: 1,
                rules: [{
                    type: 'expression',
                    formulae: [`ABS(${worksheet.getColumn(startCol).letter}2)>1`],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } },
                }]
            });

            // Yellow Rule (Priority 2)
            worksheet.addConditionalFormatting({
                ref: range,
                priority: 2,
                rules: [{
                    type: 'expression',
                    formulae: [`ABS(${worksheet.getColumn(startCol).letter}2)>0.5`],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } } },
                }]
            });

            // Green Rule (Priority 3)
            worksheet.addConditionalFormatting({
                ref: range,
                priority: 3,
                rules: [{
                    type: 'expression',
                    formulae: [`ABS(${worksheet.getColumn(startCol).letter}2)>0.01`],
                    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } },
                }]
            });
        }
    }

    // --- 5. Auto-fit Columns and Apply Borders ---
    const borderStyle = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };

    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            // Apply border to every cell
            cell.border = borderStyle;
            
            // Calculate max length for auto-fitting
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        // Set column width
        column.width = maxLength < 12 ? 12 : maxLength + 2;
    });


    // --- 6. Generate and Download File ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${baseName}_${timestamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
