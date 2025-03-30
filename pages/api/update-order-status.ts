import type { NextApiRequest, NextApiResponse } from "next"
import { google } from "googleapis"

async function getAuthToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set")
  }

  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  try {
    const { orderNumber, newStatus } = req.body

    if (!orderNumber || !newStatus) {
      return res.status(400).json({ error: "Order number and new status are required" })
    }

    const auth = await getAuthToken()
    const sheets = google.sheets({
      version: "v4",
      auth,
    })

    // 注文番号に一致する行を検索
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Order_history!A2:A",
    })

    if (!response.data.values) {
      return res.status(404).json({ error: "No orders found" })
    }

    // 注文番号に一致する行のインデックスを検索
    const rowIndex = response.data.values.findIndex((row) => row[0] === orderNumber)

    if (rowIndex === -1) {
      return res.status(404).json({ error: "Order not found" })
    }

    // 実際のスプレッドシートの行番号（1-indexed）
    const actualRowIndex = rowIndex + 2 // ヘッダー行 + 0-indexedの調整

    // ステータスを更新（AU列 = 47列目）
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `Order_history!AU${actualRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newStatus]],
      },
    })

    res.status(200).json({ success: true })
  } catch (error) {
    console.error("Error updating order status:", error)
    res.status(500).json({
      error: "Failed to update order status",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

