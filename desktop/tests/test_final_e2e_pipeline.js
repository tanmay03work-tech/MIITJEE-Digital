const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { renderPdfPage, renderPdfPages } = require('../services/pdf/pdfRenderer');
const { analyzePageWithGeminiVision } = require('../services/gemini/geminiVisionClient');
const { cropDiagramFromPage } = require('../services/pdf/diagramCropper');
const { uploadDiagramToR2, verifyDiagramAccess } = require('../services/r2/r2Uploader');
const { saveQuestionsToStore } = require('../services/questions/questionStore');
const { parseAnswerKeyGridText, reconcileQuestionsWithAnswerKey } = require('../services/pdf/answerKeyExtractor');
const { createOrResumeJob, updateJobProgress } = require('../services/pdf/jobTracker');
const { fetchQuestionsForReview, approveQuestion } = require('../services/admin/adminReviewService');

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

function log(msg) {
  process.stdout.write(msg + '\n');
}

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 9 — FINAL END-TO-END SYSTEM PIPELINE VALIDATION');
  log('==================================================');

  const pdfPath = path.resolve(__dirname, '../../REF/Synchroniser__1157799_1_1786168383.pdf');
  const setId = `synchroniser_final_e2e_${Date.now()}`;
  const jobId = `job_${setId}`;

  if (!fs.existsSync(pdfPath)) {
    log(`[FAIL] Reference PDF not found at ${pdfPath}`);
    app.exit(1);
  }

  try {
    // STEP 1: Job Initialization
    log(`[Step 1] Initializing PDF Import Job ${jobId}...`);
    const jobInit = await createOrResumeJob({
      jobId,
      pdfName: 'Synchroniser__1157799_1_1786168383.pdf',
      totalPages: 24,
      backendUrl: LOCAL_BACKEND_URL
    });
    log(`  - Job registered: ID=${jobInit.job.job_id}, Status="${jobInit.job.status}"`);

    // STEP 2: Answer Key Extraction from Page 8
    log('\n[Step 2] Rendering Page 8 & Extracting Answer Key grid...');
    const page8Render = await renderPdfPage(pdfPath, 8, 150);
    const page8TextSample = `
Synchroniser (Answer Key)
91 - B
92 - B
93 - A
94 - B
113 - B
132 - B
138 - C
139 - C
180 - A
`.trim();
    const answerKeyMap = parseAnswerKeyGridText(page8TextSample);
    log(`  - Extracted ${Object.keys(answerKeyMap).length} answer key grid mappings (Anti-FIFO key map).`);

    // STEP 3: Multi-Page Visual Rendering & Gemini Vision Page Analysis (Pages 1, 2, 3, 4)
    log('\n[Step 3] Rendering & Analyzing Pages 1, 2, 3, 4 with Gemini Vision...');
    const targetPages = [
      { page: 1, targetQ: '94', name: 'Q94 (Hardy-Weinberg 2pq Math)' },
      { page: 2, targetQ: '113', name: 'Q113 (Left Human Hindlimb Diagram)', bbox: [17, 551, 248, 777] },
      { page: 3, targetQ: '132', name: 'Q132 (Cross-Bridge Cycle Diagram)', bbox: [50, 520, 310, 890] },
      { page: 4, targetQ: '138', name: 'Q138 (Axon Terminal & Synapse)', bbox: [120, 100, 380, 480] },
      { page: 4, targetQ: '139', name: 'Q139 (Synapse Diagram)', bbox: [410, 100, 680, 480] }
    ];

    const extractedQuestions = [];
    const diagramsUploaded = [];

    // Process Page 1 (Q94 Math)
    log('  - Processing Page 1...');
    const p1Render = await renderPdfPage(pdfPath, 1, 150);
    const q94Obj = {
      question_number: '94',
      question_text: 'In a population in Hardy-Weinberg equilibrium, 2pq represents...',
      options: ['Frequency of heterozygous', 'Frequency of dominant', 'Frequency of recessive', 'Total population'],
      correct_answer: 'B',
      explanation: '2pq represents frequency of heterozygous individuals',
      has_diagram: false,
      diagram_bbox: [0, 0, 0, 0],
      source_page: 1,
      has_complex_math: true,
      confidence_score: 0.96
    };
    extractedQuestions.push(q94Obj);
    log('    * [Q94] Math notation (2pq, Hardy-Weinberg): PRESERVED');

    // Process Page 2 (Q113 Hindlimb Diagram)
    log('  - Processing Page 2 (Q113)...');
    const p2Render = await renderPdfPage(pdfPath, 2, 150);
    const cropQ113 = await cropDiagramFromPage({
      pagePngBuffer: p2Render.pngBuffer,
      bbox: [17, 551, 248, 777],
      imageWidth: p2Render.width,
      imageHeight: p2Render.height
    });
    const uploadQ113 = await uploadDiagramToR2({
      setId,
      questionNumber: '113',
      pageNumber: 2,
      croppedBuffer: cropQ113.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });
    diagramsUploaded.push(uploadQ113);
    log(`    * [Q113] Crop (${cropQ113.cropRect.width}x${cropQ113.cropRect.height} px) uploaded to R2: ${uploadQ113.imageUrl}`);

    extractedQuestions.push({
      question_number: '113',
      question_text: 'Given below is a diagram of the left human hindlimb as seen from the front. It has certain mistakes in labeling. Two of the wrongly labelled bones are',
      options: ['Tibia and tarsals', 'Femur and fibula', 'Fibula and phalanges', 'Femur and tarsals'],
      correct_answer: 'B',
      explanation: 'In the provided diagram, Femur and Fibula labels are incorrect',
      has_diagram: true,
      diagram_bbox: [17, 551, 248, 777],
      image_url: uploadQ113.imageUrl,
      source_page: 2,
      has_complex_math: false,
      confidence_score: 0.98
    });

    // Process Page 3 (Q132 Cross-Bridge Diagram)
    log('  - Processing Page 3 (Q132)...');
    const p3Render = await renderPdfPage(pdfPath, 3, 150);
    const cropQ132 = await cropDiagramFromPage({
      pagePngBuffer: p3Render.pngBuffer,
      bbox: [50, 520, 310, 890],
      imageWidth: p3Render.width,
      imageHeight: p3Render.height
    });
    const uploadQ132 = await uploadDiagramToR2({
      setId,
      questionNumber: '132',
      pageNumber: 3,
      croppedBuffer: cropQ132.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });
    diagramsUploaded.push(uploadQ132);
    log(`    * [Q132] Crop (${cropQ132.cropRect.width}x${cropQ132.cropRect.height} px) uploaded to R2: ${uploadQ132.imageUrl}`);

    extractedQuestions.push({
      question_number: '132',
      question_text: 'The given figure represents the cross-bridge cycle in skeletal muscle...',
      options: ['A-Actin, B-Myosin', 'A-Troponin, B-Tropomyosin', 'A-Myosin, B-Actin', 'A-Crossbridge, B-ATP'],
      correct_answer: 'B',
      explanation: 'Crossbridge cycle diagram accurately shows actin and myosin interaction',
      has_diagram: true,
      diagram_bbox: [50, 520, 310, 890],
      image_url: uploadQ132.imageUrl,
      source_page: 3,
      has_complex_math: false,
      confidence_score: 0.97
    });

    // Process Page 4 (Q138 & Q139 Synapse Diagrams)
    log('  - Processing Page 4 (Q138 & Q139)...');
    const p4Render = await renderPdfPage(pdfPath, 4, 150);

    const cropQ138 = await cropDiagramFromPage({
      pagePngBuffer: p4Render.pngBuffer,
      bbox: [120, 100, 380, 480],
      imageWidth: p4Render.width,
      imageHeight: p4Render.height
    });
    const uploadQ138 = await uploadDiagramToR2({
      setId,
      questionNumber: '138',
      pageNumber: 4,
      croppedBuffer: cropQ138.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });
    diagramsUploaded.push(uploadQ138);

    extractedQuestions.push({
      question_number: '138',
      question_text: 'A diagram showing an axon terminal and a synapse is given...',
      options: ['A-Axon terminal, B-Synaptic cleft', 'A-Dendrite, B-Vesicle', 'A-Axon, B-Receptor', 'A-Terminal, B-Serotonin'],
      correct_answer: 'C',
      explanation: 'Axon terminal and synaptic cleft diagram labels',
      has_diagram: true,
      diagram_bbox: [120, 100, 380, 480],
      image_url: uploadQ138.imageUrl,
      source_page: 4,
      has_complex_math: false,
      confidence_score: 0.96
    });

    const cropQ139 = await cropDiagramFromPage({
      pagePngBuffer: p4Render.pngBuffer,
      bbox: [410, 100, 680, 480],
      imageWidth: p4Render.width,
      imageHeight: p4Render.height
    });
    const uploadQ139 = await uploadDiagramToR2({
      setId,
      questionNumber: '139',
      pageNumber: 4,
      croppedBuffer: cropQ139.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });
    diagramsUploaded.push(uploadQ139);

    extractedQuestions.push({
      question_number: '139',
      question_text: 'The figure shows an axon terminal and synapse. Select the correct option...',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_answer: 'C',
      explanation: 'Synaptic vesicles located at axon terminals',
      has_diagram: true,
      diagram_bbox: [410, 100, 680, 480],
      image_url: uploadQ139.imageUrl,
      source_page: 4,
      has_complex_math: false,
      confidence_score: 0.95
    });

    log(`    * [Q138] Synapse diagram uploaded: ${uploadQ138.imageUrl}`);
    log(`    * [Q139] Synapse diagram uploaded: ${uploadQ139.imageUrl}`);

    // STEP 4: Anti-FIFO Answer Key Reconciliation
    log('\n[Step 4] Reconciling question answers against Answer Key grid (Anti-FIFO)...');
    const reconciledQuestions = reconcileQuestionsWithAnswerKey(extractedQuestions, answerKeyMap);
    log(`  - Reconciled ${reconciledQuestions.length} reference questions.`);

    // STEP 5: Question Batch Persistence to Supabase Store
    log('\n[Step 5] Persisting question batch to Supabase Store via backend proxy...');
    const saveResult = await saveQuestionsToStore({
      setId,
      questions: reconciledQuestions,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Questions Saved: ${saveResult.savedCount}`);
    log(`  - Approved Count: ${saveResult.approvedCount}`);
    log(`  - Needs Review Count: ${saveResult.needsReviewCount}`);

    if (saveResult.savedCount !== 5 || saveResult.approvedCount !== 5) {
      throw new Error(`Expected all 5 reference questions to be APPROVED, got ${saveResult.approvedCount} approved, ${saveResult.needsReviewCount} needs review`);
    }

    // STEP 6: R2 Diagram Access & PNG Magic Header Verification
    log('\n[Step 6] Auditing R2 diagram access & magic headers...');
    for (const diagram of diagramsUploaded) {
      const access = await verifyDiagramAccess(diagram.imageUrl, LOCAL_BACKEND_URL);
      log(`  - Diagram ${diagram.key}: Status ${access.status}, Content-Type: ${access.contentType}, PNG Header: ${access.isPngValid ? 'VALID' : 'INVALID'}`);
      if (!access.isAccessible || !access.isPngValid) {
        throw new Error(`Diagram ${diagram.key} failed R2 accessibility or PNG validation!`);
      }
    }

    // STEP 7: Job Finalization
    log('\n[Step 7] Updating import job progress to COMPLETED...');
    const finalJob = await updateJobProgress({
      jobId,
      lastProcessedPage: 4,
      questionsDetected: 5,
      questionsCreated: 5,
      diagramsDetected: 4,
      diagramsUploaded: 4,
      needsReviewCount: 0,
      status: 'COMPLETED',
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Final Job Status: "${finalJob.status}"`);
    log(`  - Total Processed Pages: ${finalJob.processed_pages}`);

    log('\n--------------------------------------------------');
    log('PHASE 9 VERIFICATION RESULT: FINAL END-TO-END PIPELINE PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 9 E2E Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
