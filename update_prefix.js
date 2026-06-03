const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'songs.json');
const songs = JSON.parse(fs.readFileSync(file, 'utf8'));
let count = 0;
songs.forEach(song => {
    if (song.number && song.number.startsWith('弘') && !song.number.startsWith('弘音')) {
        song.number = song.number.replace('弘', '弘音');
        count++;
    }
});
fs.writeFileSync(file, JSON.stringify(songs, null, 4), 'utf8');
console.log(`Updated ${count} songs.`);
