const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function verifyAll() {
  console.log('=== 1. ELEVATOR TEST VERIFICATION ===');
  const elevator = await req('pdf_native_tests?id=eq.pdf_test_1786853175921');
  console.log('Test metadata:', elevator[0].title, '| Total Qs:', elevator[0].total_questions, '| Status:', elevator[0].status);

  const elevatorSections = await req('pdf_native_test_sections?test_id=eq.pdf_test_1786853175921&order=section_order.asc');
  console.log('Sections:', elevatorSections.map(s => `${s.section_order}. ${s.subject} (Q${s.question_start}-Q${s.question_end}, ${s.mcq_count} Qs)`));

  const elevatorSets = await req('pdf_native_test_sets?test_id=eq.pdf_test_1786853175921&order=order_index.asc');
  console.log('Linked Sets:', elevatorSets.map(s => s.set_id));

  const elevatorTq = await req('pdf_native_test_questions?test_id=eq.pdf_test_1786853175921&order=order_index.asc');
  console.log('Total Questions Linked:', elevatorTq.length);

  console.log('\n=== 2. GENESIS TEST VERIFICATION ===');
  const genesis = await req('pdf_native_tests?id=eq.pdf_test_genesis_neet_11');
  console.log('Test metadata:', genesis[0].title, '| Total Qs:', genesis[0].total_questions, '| Status:', genesis[0].status);

  const genesisSections = await req('pdf_native_test_sections?test_id=eq.pdf_test_genesis_neet_11&order=section_order.asc');
  console.log('Sections:', genesisSections.map(s => `${s.section_order}. ${s.subject} (Q${s.question_start}-Q${s.question_end}, ${s.mcq_count} Qs)`));

  const genesisSets = await req('pdf_native_test_sets?test_id=eq.pdf_test_genesis_neet_11&order=order_index.asc');
  console.log('Linked Sets:', genesisSets.map(s => s.set_id));

  const genesisTq = await req('pdf_native_test_questions?test_id=eq.pdf_test_genesis_neet_11&order=order_index.asc');
  console.log('Total Questions Linked:', genesisTq.length);
}

verifyAll();
