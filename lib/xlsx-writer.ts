/**
 * xlsx-writer.ts
 * Wrapper around `write-excel-file` — lightweight, no known vulnerabilities.
 * Install: npm install write-excel-file
 * Types:   npm install --save-dev @types/write-excel-file  (optional, has built-in types)
 */

export interface XlsxSheet {
    name: string
    columns: { header: string; key: string; width?: number }[]
    rows: Record<string, string | number>[]
  }
  
  const HEADER_BG = "#E8D6F5"
  const HEADER_COLOR = "#5A2080"
  
  export async function downloadXlsx(sheets: XlsxSheet[], filename: string): Promise<void> {
    const writeXlsxFile = (await import("write-excel-file")).default
  
    if (sheets.length === 1) {
      // Single sheet
      const sheet = sheets[0]
      const schema = sheet.columns.map((col) => ({
        column: col.header,
        width: col.width ?? 18,
        value: (row: Record<string, string | number>) => {
          const v = row[col.key]
          if (v === undefined || v === null || v === "") return ""
          return typeof v === "number" ? v : String(v)
        },
      }))
  
      await writeXlsxFile(sheet.rows as Record<string, string | number>[], {
        schema,
        headerStyle: {
          backgroundColor: HEADER_BG,
          color: HEADER_COLOR,
          fontWeight: "bold",
          fontSize: 10,
          fontFamily: "Arial",
        },
        fileName: filename,
      })
    } else {
      // Multiple sheets
      const allData = sheets.map((sheet) => {
        const schema = sheet.columns.map((col) => ({
          column: col.header,
          width: col.width ?? 18,
          value: (row: Record<string, string | number>) => {
            const v = row[col.key]
            if (v === undefined || v === null || v === "") return ""
            return typeof v === "number" ? v : String(v)
          },
        }))
        return { schema, data: sheet.rows as Record<string, string | number>[] }
      })
  
      const dataArrays = allData.map((s) => s.data)
      const schemas = allData.map((s) => s.schema)
  
      await writeXlsxFile(dataArrays, {
        schema: schemas,
        sheets: sheets.map((s) => s.name),
        headerStyle: {
          backgroundColor: HEADER_BG,
          color: HEADER_COLOR,
          fontWeight: "bold",
          fontSize: 10,
          fontFamily: "Arial",
        },
        fileName: filename,
      })
    }
  }