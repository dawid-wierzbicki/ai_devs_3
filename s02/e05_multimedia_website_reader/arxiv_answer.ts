import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
if (!CENTRALA_API_KEY) {
    console.error("ERROR: CENTRALA_API_KEY environment variable not set.");
    process.exit(1);
}

const QUESTIONS_URL = `https://c3ntrala.ag3nts.org/data/${CENTRALA_API_KEY}/arxiv.txt`;

async function fetchQuestions(): Promise<{ [key: string]: string }> {
    const res = await fetch(QUESTIONS_URL);
    if (!res.ok) throw new Error(`Failed to fetch questions: ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n').filter(Boolean);
    const questions: { [key: string]: string } = {};
    for (const line of lines) {
        const match = line.match(/^([0-9]{2})[.:-] (.+)$/);
        if (match) {
            questions[match[1]] = match[2];
        }
    }
    return questions;
}

function getFileSummaries(): { [filename: string]: string } {
    const baseDirs = ['s02/e05_multimedia_website_reader/images', 's02/e05_multimedia_website_reader/audio', 's02/e05_multimedia_website_reader/text'];
    const summaries: { [filename: string]: string } = {};
    for (const dir of baseDirs) {
        if (fs.existsSync(dir)) {
            for (const file of fs.readdirSync(dir)) {
                const filePath = path.join(dir, file);
                let content = '';
                if (file.endsWith('.txt')) {
                    content = fs.readFileSync(filePath, 'utf-8').slice(0, 200);
                }
                summaries[file] = content || file;
            }
        }
    }
    return summaries;
}

async function main() {
    const questions = await fetchQuestions();
    const fileSummaries = getFileSummaries();

    const answer: { [key: string]: string } = {};
    for (const [num, q] of Object.entries(questions)) {
        let found = '';
        for (const [fname, summary] of Object.entries(fileSummaries)) {
            if (q.toLowerCase().includes(fname.split('.')[0].toLowerCase()) || summary.toLowerCase().includes(q.toLowerCase().split(' ')[0])) {
                found = summary ? summary.split('\n')[0] : fname;
                break;
            }
        }
        answer[num] = found ? `Odpowiedź: ${found}` : 'Brak danych w plikach';
    }

    const response = {
        task: "arxiv",
        apikey: CENTRALA_API_KEY,
        answer
    };

    console.log(JSON.stringify(response, null, 2));
}

main(); 