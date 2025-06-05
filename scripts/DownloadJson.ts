import { DownloaderHelper } from 'node-downloader-helper';
import path from 'path';


function downloadFile (url: string, filename: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const dl = new DownloaderHelper(url, path.join(__dirname, '../temp'), {
            fileName: filename,
            retry: { maxRetries: 3, delay: 2000 },
        });
        dl.on('end', ()  =>{
            console.log(`Downloaded ${filename}`);
            resolve();
        });

        dl.on('error', (err) => {
            console.log(`Failed to download ${filename}:`, err);
            reject(err);
        });

        dl.on('progress', (stats) => {
            const percent = (stats.progress).toFixed(2);
            process.stdout.write(`\r ${filename}: ${percent}%`);
        });

        dl.start();
    });
}

(async () => {
    try {
        console.log('Starting MTGJSON downloads...');

        await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');
        await downloadFile('https://mtgjson.com/api/v5/AllPrintings.json', 'AllPrintings.json');

        console.log('All Downloads Complete.');
    } catch (err) {
        console.error('Download process failed:', err);
    }
})();