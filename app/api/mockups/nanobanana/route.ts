import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { artworkUrl, placement } = await req.json()

    // VALIDATION
    if (!artworkUrl || !placement) {
      return NextResponse.json(
        { success: false, error: "Missing artworkUrl or placement" },
        { status: 400 }
      )
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing GEMINI_API_KEY" },
        { status: 500 }
      )
    }

    // STEP 1: ask Gemini to create mockup prompt
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a product mockup designer.

Create a professional image generation prompt for:

Design: ${artworkUrl}
Placement: ${placement}

Rules:
- white t-shirt
- realistic fabric
- studio lighting
- e-commerce product photo
- do not modify the design
`
                }
              ]
            }
          ]
        })
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error("Gemini error:", err)

      return NextResponse.json(
        { success: false, error: "Gemini failed" },
        { status: 500 }
      )
    }

    const data = await geminiRes.json()

    const prompt =
      data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Empty Gemini response" },
        { status: 500 }
      )
    }

    // IMPORTANT: return prompt safely (no crash)
    return NextResponse.json({
      success: true,
      prompt,
      imageUrl: artworkUrl, // fallback so UI doesn't break
    })
  } catch (err: any) {
    console.error(err)

    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    )
  }
}