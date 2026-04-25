const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const modelsDir = path.join(__dirname, 'models');
if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
}

models.forEach(m => {
    const url = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/' + m;
    https.get(url, res => {
        if (res.statusCode !== 200) {
            console.error(`Failed to download ${m}: Status ${res.statusCode}`);
            return;
        }
        const f = fs.createWriteStream(path.join(modelsDir, m));
        res.pipe(f);
        f.on('finish', () => console.log('Downloaded: ' + m));
    }).on('error', err => console.error(`Error downloading ${m}:`, err.message));
});
