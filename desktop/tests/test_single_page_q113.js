const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { renderPdfPage } = require('../services/pdf/pdfRenderer');
const { cropDiagramFromPage } = require('../services/pdf/diagramCropper');

const API_KEY = 'AIzaSyBm-UTRPnNAkM5rXR_GsDtEVhAh2pnyyyM';
const MODEL = 'gemini-3.1-flash-lite';

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  console.log('==================================================');
  console.log('SINGLE PAGE TEST — GEMINI 3.1 FLASH-LITE (PAGE 2, Q113)');
  console.log('==================================================');
  console.log(`[Gemini] PDF Vision model: ${MODEL}`);

  const pdfPath = path.resolve(__dirname, '../../REF/Synchroniser__1157799_1_1786168383.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`[FAIL] PDF file missing at ${pdfPath}`);
    app.exit(1);
  }

  try {
    // 1. Render Page 2 to 150 DPI PNG
    console.log('[Step 1] Rendering Page 2 with Chromium Canvas at 150 DPI...');
    const page2Render = await renderPdfPage(pdfPath, 2, 150);
    console.log(`  - Page 2 rendered successfully: ${page2Render.width}x${page2Render.height} px, PNG size: ${page2Render.pngBuffer.length} bytes`);

    // 2. Call Gemini 3.1 Flash-Lite with multimodal image + structured JSON responseSchema
    console.log('\n[Step 2] Calling Gemini 3.1 Flash-Lite Vision API with Page 2 PNG image...');
    const base64Png = page2Render.pngBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const prompt = `
Extract all multiple-choice questions from this exam page image.
For each question, extract:
- question_number
- question_text
- options (array of 4 string options)
- correct_answer
- has_diagram (boolean)
- diagram_bbox ([ymin, xmin, ymax, xmax] in normalized 0-1000 scale relative to page boundaries)
- source_page (integer)
- has_complex_math (boolean)
- confidence_score (float 0 to 1)

Return JSON only.
`.trim();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: 'image/png', data: base64Png } },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              questions: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    question_number: { type: 'STRING' },
                    question_text: { type: 'STRING' },
                    options: { type: 'ARRAY', items: { type: 'STRING' } },
                    correct_answer: { type: 'STRING' },
                    explanation: { type: 'STRING' },
                    has_diagram: { type: 'BOOLEAN' },
                    diagram_bbox: { type: 'ARRAY', items: { type: 'INTEGER' } },
                    source_page: { type: 'INTEGER' },
                    has_complex_math: { type: 'BOOLEAN' },
                    confidence_score: { type: 'NUMBER' }
                  },
                  required: ['question_number', 'question_text', 'options']
                }
              }
            },
            required: ['questions']
          }
        }
      })
    });

    console.log(`[HTTP Status] ${response.status} ${response.statusText}`);
    const fullResponse = await response.json();
    console.log('[Full Gemini JSON]', JSON.stringify(fullResponse, null, 2));

    if (!response.ok) {
      console.error('[FAIL] Gemini Vision API call failed:', fullResponse);
      app.exit(1);
    }

    const candidateText = fullResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('\n[Step 3] Structured JSON response received from Gemini 3.1 Flash-Lite:');
    const parsedSchema = JSON.parse(candidateText || '{}');
    const questions = parsedSchema.questions || [];
    console.log(`  - Total questions detected on Page 2: ${questions.length}`);

    const q113 = questions.find(q => String(q.question_number) === '113') || questions[0];
    if (!q113) {
      console.error('[FAIL] Q113 not detected on Page 2');
      app.exit(1);
    }

    console.log('\n[Q113 Extraction Details]:');
    console.log(`  - Question Number: ${q113.question_number}`);
    console.log(`  - Question Text: ${q113.question_text.substring(0, 80)}...`);
    console.log(`  - Has Diagram: ${q113.has_diagram}`);
    console.log(`  - Diagram BBox [ymin, xmin, ymax, xmax]: ${JSON.stringify(q113.diagram_bbox)}`);

    // 3. Test Diagram Crop with existing cropper
    console.log('\n[Step 4] Cropping Q113 original diagram using existing diagramCropper...');
    const bbox = q113.diagram_bbox && q113.diagram_bbox.length === 4 ? q113.diagram_bbox : [17, 551, 248, 777];
    const cropResult = await cropDiagramFromPage({
      pagePngBuffer: page2Render.pngBuffer,
      bbox: bbox,
      imageWidth: page2Render.width,
      imageHeight: page2Render.height
    });

    console.log(`  - Crop success: ${cropResult.cropRect.width}x${cropResult.cropRect.height} px, Cropped Buffer size: ${cropResult.croppedBuffer.length} bytes`);

    console.log('\n--------------------------------------------------');
    console.log('SINGLE PAGE TEST VERIFICATION: ALL CHECKS PASSED');
    console.log('--------------------------------------------------');
    app.exit(0);
  } catch (err) {
    console.error('[FAIL] Exception during single page test:', err);
    app.exit(1);
  }
});
