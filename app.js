import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://ycoerpqdorzilwsahczl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_i9o1qSLTRC-XSi5-5y2EVw__A3v3HnM';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
let bank = [], quiz = [], index = 0, score = 0, answered = false;

function renderBank() {
  $('practiceView').classList.toggle('hidden', bank.length === 0);
  $('bankCount').textContent = `${bank.length} 題已校對`;
  if ($('metricBank')) $('metricBank').textContent = bank.length;
}
function answerIndex(value) { return Math.max(0, 'ABCD'.indexOf(String(value).toUpperCase())); }
function normalizeRow(row) { return { ...row, answer: Number(row.answer), page: row.source_page, source: row.source_file }; }
function cleanPdfText(text) {
  return text.split('\n').filter((line) => {
    const value = line.trim();
    return value && !/^第\s*\d+\s*頁，共\s*\d+\s*頁$/i.test(value)
      && !/^答案\s*題目$/i.test(value)
      && value !== '答案'
      && value !== '題目'
      && !/AI\s*應用規劃師.*公告試題/i.test(value)
      && !/^第一科[:：]/i.test(value)
      && !/^考試日期[:：]/i.test(value)
      && value !== '一、選擇題';
  }).join('\n');
}
async function loadBank() {
  const { data, error } = await supabase.from('questions').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  bank = data.map(normalizeRow); renderBank();
}
async function initCloud() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  await loadBank();
  $('fileStatus').textContent = '雲端題庫已連線，資料會自動保存。';
}
function parseQuestions(text, fileName = '貼上文字', pageOffsets = []) {
  text = cleanPdfText(text);
  const hasAnswerColumn = /(?:^|\n)\s*[A-D]\s+\d{1,3}\.\s+/i.test(text);
  const startPattern = hasAnswerColumn ? /(?:^|\n)\s*(?:([A-D])\s+)?(\d{1,3})\.\s+/g : /(?:^|\n)\s*(\d{1,3})\.\s+/g;
  const starts = [...text.matchAll(startPattern)].map((match) => ({ answer: hasAnswerColumn ? match[1] : '', number: hasAnswerColumn ? match[2] : match[1], markerStart: match.index, start: match.index + match[0].length }));
  const blocks = starts.map((item, i) => text.slice(item.start, starts[i + 1]?.markerStart ?? text.length).replace(/\s*第\s*\d+\s*頁，共\s*\d+\s*頁\s*$/i, '').trim());
  return blocks.map((block, i) => {
    const answer = starts[i + 1]?.answer || block.match(/\n\s*([A-D])\s*(?=\n|$)/i)?.[1];
    const optionMatches = [...block.matchAll(/\(([A-D])\)\s*([\s\S]*?)(?=\([A-D]\)\s*|$)/gi)];
    const options = optionMatches.map((match) => match[2].replace(/\s+/g, ' ').trim());
    const question = block.slice(0, optionMatches[0]?.index ?? 0).replace(/\s*答案\s*題目\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!question || options.length !== 4) return null;
    const page = pageOffsets.reduce((result, entry) => starts[i].markerStart >= entry.offset ? entry.pageNo : result, 1);
    return { question, options, answer: answer ? answerIndex(answer) : 0, explanation: '', source: fileName, page, reviewed: false, ai: false, incomplete: !answer };
  }).filter(Boolean);
}
function showReview(items) {
  const list = $('reviewList'); list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<p class="danger">找不到完整的四選一題目。請確認每題有四個選項與答案。</p>'; return; }
  items.forEach((item, i) => {
    const el = document.createElement('article'); el.className = 'review-item';
    el.innerHTML = `<strong>第 ${i + 1} 題</strong><p class="review-meta">來源：${escapeHtml(item.source)} · PDF 第 ${item.page} 頁${item.incomplete ? ' · 需要人工校對答案' : ''}</p><textarea rows="2">${escapeHtml(item.question)}</textarea>${item.options.map((o, n) => `<input value="${escapeHtml(o)}" aria-label="選項 ${n + 1}">`).join('')}<label>正確答案 <select>${'ABCD'.split('').map((x, n) => `<option value="${n}" ${n === item.answer ? 'selected' : ''}>${x}</option>`).join('')}</select></label><button>加入雲端題庫</button>`;
    el.querySelector('button').onclick = async () => {
      const fields = el.querySelectorAll('input');
      const question = el.querySelector('textarea').value;
      const duplicate = bank.some((old) => old.question === question && old.source === item.source && old.page === item.page);
      if (duplicate) { el.querySelector('button').textContent = '已存在'; return; }
      const payload = { question, options: [...fields].map((x) => x.value), answer: Number(el.querySelector('select').value), explanation: item.explanation, source_file: item.source, source_page: item.page, reviewed: true, ai: false };
      const { data, error } = await supabase.from('questions').insert(payload).select().single();
      if (error) { el.querySelector('.review-meta').textContent = `保存失敗：${error.message}`; return; }
      bank.push(normalizeRow(data)); renderBank(); el.remove();
    };
    list.append(el);
  });
}
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function startQuiz() { quiz = [...bank].sort(() => Math.random() - .5).slice(0, Math.min(10, bank.length)); index = 0; score = 0; answered = false; $('quizView').classList.remove('hidden'); renderQuestion(); $('quizView').scrollIntoView({ behavior: 'smooth' }); }
function renderQuestion() {
  const q = quiz[index]; $('progress').textContent = `第 ${index + 1} 題／共 ${quiz.length} 題`;
  $('questionBox').innerHTML = `<article class="question"><h3>${escapeHtml(q.question)}</h3><div class="options">${q.options.map((o, n) => `<label><input type="radio" name="answer" value="${n}"> ${'ABCD'[n]}. ${escapeHtml(o)}</label>`).join('')}</div></article>`;
  $('nextQuestion').textContent = '確認答案'; $('nextQuestion').classList.remove('hidden'); $('result').innerHTML = ''; answered = false;
}
function submitQuestion() {
  const picked = document.querySelector('input[name=answer]:checked'); if (!picked) return;
  const q = quiz[index];
  if (!answered) {
    const isCorrect = Number(picked.value) === q.answer; if (isCorrect) score++;
    document.querySelectorAll('input[name=answer]').forEach((input) => { input.disabled = true; input.closest('label').classList.toggle('correct', Number(input.value) === q.answer); input.closest('label').classList.toggle('wrong', input === picked && !isCorrect); });
    $('result').innerHTML = `<div class="feedback ${isCorrect ? 'correct' : 'wrong'}"><strong>${isCorrect ? '答對！' : '答錯了。'}</strong><p>正確答案：${'ABCD'[q.answer]}</p><p>${escapeHtml(q.explanation || '尚無解析。')}</p></div>`;
    $('nextQuestion').textContent = index === quiz.length - 1 ? '查看結果' : '下一題'; answered = true; return;
  }
  if (index < quiz.length - 1) { index++; renderQuestion(); return; }
  $('questionBox').innerHTML = ''; $('nextQuestion').classList.add('hidden'); $('progress').textContent = '測驗完成'; $('result').innerHTML = `<h3>測驗完成</h3><p>答對 ${score} 題，答錯 ${quiz.length - score} 題。</p>`;
}
$('parseText').onclick = () => showReview(parseQuestions($('textInput').value));
$('developerLogin').onclick = async () => {
  const email = $('developerEmail').value.trim();
  if (!email) { $('developerStatus').textContent = '請先輸入 Email。'; return; }
  $('developerStatus').textContent = '正在寄送登入連結…';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  $('developerStatus').textContent = error ? `寄送失敗：${error.message}` : '登入連結已寄出，請查看 Email。';
};
$('heroImport').onclick = () => $('importView').scrollIntoView({ behavior: 'smooth' });
$('startQuiz').onclick = startQuiz;
$('nextQuestion').onclick = submitQuestion;
async function parsePdfBuffer(buffer, fileName) {
  try {
    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const pages = [], pageOffsets = [];
    let combined = '';
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) { const page = await pdf.getPage(pageNo); const content = await page.getTextContent(); const text = cleanPdfText(content.items.map((item) => item.str).join('\n')); pageOffsets.push({ pageNo, offset: combined.length }); combined += `${text}\n`; }
    const items = parseQuestions(combined, fileName, pageOffsets);
    return { items, pages: pdf.numPages };
  } catch (error) { $('fileStatus').textContent = `PDF 解析失敗：${error.message || '未知錯誤'}。`; console.error(error); }
}
async function storePdf(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('匿名身分尚未建立');
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('exam-pdfs').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
}
$('pdfInput').onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  $('fileStatus').textContent = `正在讀取：${file.name}`;
  try {
    const result = await parsePdfBuffer(await file.arrayBuffer(), file.name);
    if (!result) return;
    await storePdf(file);
    $('fileStatus').textContent = `已讀取 ${result.pages} 頁，找到 ${result.items.length} 題可校對題目；原始 PDF 已保存。`;
    showReview(result.items);
  } catch (error) { $('fileStatus').textContent = `檔案匯入失敗：${error.message || '未知錯誤'}`; }
};
$('loadPdfUrl').onclick = async () => {
  const url = $('pdfUrl').value.trim();
  if (!url) return;
  $('fileStatus').textContent = '正在從公開網址下載 PDF…';
  try {
    const { data, error } = await supabase.functions.invoke('fetch-pdf', { body: { url } });
    if (error) throw error;
    const fileName = url.split('/').pop()?.split('?')[0] || '公開網址.pdf';
    const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
    const result = await parsePdfBuffer(bytes, fileName);
    if (!result) return;
    await storePdf(new File([bytes], fileName, { type: 'application/pdf' }));
    $('fileStatus').textContent = `已讀取 ${result.pages} 頁，找到 ${result.items.length} 題可校對題目；原始 PDF 已保存。`;
    showReview(result.items);
  } catch (error) { $('fileStatus').textContent = `網址匯入失敗：${error.message || '請確認網址可公開下載 PDF。'}`; }
};
$('generateAi').onclick = () => { $('aiStatus').textContent = 'AI 生成需接後端 API；目前先保留審核流程，避免將 API 金鑰放在前端。'; };
initCloud().catch((error) => { $('fileStatus').textContent = `雲端連線失敗：${error.message || '請確認 Supabase 已開啟 Anonymous sign-ins。'}`; });
