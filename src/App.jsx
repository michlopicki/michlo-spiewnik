import { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import ChordSheetJS from 'chordsheetjs';
import { Search, Flame, Music, FileText, ExternalLink, ArrowLeft, Plus, Minus, Sun, Moon, Type, Image as ImageIcon } from 'lucide-react';
import './index.css';

// --- Home Component (Search and List) ---
function Home({ songs }) {
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  // Extract unique tags
  const allTags = useMemo(() => {
    const tags = new Set();
    songs.forEach(song => {
      if (song.tags) {
        song.tags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags).sort();
  }, [songs]);

  // Filter songs by tags (OR logic for multi-select)
  const filteredSongs = useMemo(() => {
    if (selectedTags.length === 0) return songs;
    return songs.filter(song => 
      selectedTags.some(tag => song.tags && song.tags.includes(tag))
    );
  }, [songs, selectedTags]);

  // Setup Fuse.js for fuzzy searching on filtered songs
  const fuse = useMemo(() => new Fuse(filteredSongs, {
    keys: ['title', 'artist'],
    threshold: 0.3, // 0 is exact, 1 is match anything
  }), [filteredSongs]);

  // If there's a query, use fuse search results. Otherwise show all filtered songs sorted alphabetically.
  const results = query 
    ? fuse.search(query).map(result => result.item) 
    : [...filteredSongs].sort((a, b) => a.title.localeCompare(b.title, 'pl'));

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? []
        : [tag]
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Śpiewnik zjazdowy | Reunion songbook</h1>
        <div className="search-container">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            className="search-input"
            placeholder="Search for a song or artist..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        
        {allTags.length > 0 && (
          <div className="tags-container">
            <button 
              className={`tag-pill ${selectedTags.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedTags([])}
            >
              All
            </button>
            {allTags.map(tag => (
              <button 
                key={tag}
                className={`tag-pill ${selectedTags.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="song-list">
        {results.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Brak wyników...</p>
        ) : (
          results.map(song => (
            <Link to={`/song/${song.id}`} key={song.id} className="song-card">
              <div className="song-info">
                <span className="song-title">{song.title}</span>
                <span className="song-artist">{song.artist}</span>
              </div>
              <div className="song-type-icon">
                {song.type === 'chordpro' && <Music size={24} />}
                {song.type === 'pdf' && <FileText size={24} />}
                {song.type === 'link' && <ExternalLink size={24} />}
                {song.type === 'image' && <ImageIcon size={24} />}
              </div>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}

// --- Song View Component ---
function SongView({ songs }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [song, setSong] = useState(null);
  const [chordProData, setChordProData] = useState('');
  const [transposeDelta, setTransposeDelta] = useState(0);
  const [usePolishChords, setUsePolishChords] = useState(false);

  const [zoomLevel, setZoomLevel] = useState(1);

  // Funkcja konwertująca pojedynczy segment akordu na polską notację
  const segmentToPolish = (segment) => {
    if (!segment) return segment;
    let newSeg = segment;
    
    // B -> H, Bb -> B
    newSeg = newSeg.replace(/^B(?!b)/, 'H');
    newSeg = newSeg.replace(/^Bb/, 'B');
    
    // Regex do wyciągnięcia: Bazy(A-H), Znaku(b/#), Moll(m), Reszty
    const match = newSeg.match(/^([A-H])([b#]?)(m?)(.*)$/);
    if (!match) return newSeg;

    let [_, base, acc, min, rest] = match;

    // Krzyżyki i bemole
    if (acc === '#') {
      base = base + 'is';
      acc = '';
    } else if (acc === 'b') {
      base = base + 'es';
      if (base === 'Aes') base = 'As';
      if (base === 'Ees') base = 'Es';
      acc = '';
    }

    // Molowe pisane z małej litery
    if (min === 'm') {
      base = base.toLowerCase();
    }

    return base + acc + rest;
  };

  // Funkcja konwertująca cały akord (z ewentualnym basem po ukośniku)
  const toPolishChord = (chord) => {
    if (!chord) return chord;
    // Dzielimy akord po ukośniku (jeśli występuje) i konwertujemy obie części
    return chord.split('/').map(segmentToPolish).join('/');
  };

  useEffect(() => {
    const foundSong = songs.find(s => s.id === id);
    if (foundSong) {
      setSong(foundSong);
      if (foundSong.type === 'chordpro') {
        // Fetch the .pro file
        fetch(`${import.meta.env.BASE_URL}songs/${foundSong.type}/${foundSong.file}`)
          .then(res => res.text())
          .then(text => setChordProData(text))
          .catch(err => console.error("Failed to load song:", err));
      }
    }
  }, [id, songs]);

  if (!song) return <div className="app-container"><p>Ładowanie lub nie znaleziono utworu...</p></div>;

  // Funkcja normalizująca polskie akordy do międzynarodowych przed przetworzeniem przez parser
  const normalizeChordPro = (text) => {
    return text.replace(/\[(.*?)\]/g, (match, chord) => {
      if (!chord) return match;
      const m = chord.match(/^([CDEFGABHcdefgabh])(is|es|#|b)?(m)?(.*)$/);
      if (!m) return match;
      
      let [_, root, acc, min, rest] = m;
      let isMinor = !!min || (root === root.toLowerCase());
      let upperRoot = root.toUpperCase();
      
      if (upperRoot === 'H') {
        upperRoot = 'B';
      } else if (upperRoot === 'B') {
        if (acc !== '#' && acc !== 'b') {
           upperRoot = 'Bb';
           acc = '';
        }
      }
      
      let newAcc = acc || '';
      if (newAcc === 'is') newAcc = '#';
      else if (newAcc === 'es') newAcc = 'b';
      
      let result = upperRoot + newAcc + (isMinor ? 'm' : '') + rest;
      if (result.startsWith('Bbb')) result = result.replace('Bbb', 'Bb');
      
      return `[${result}]`;
    });
  };

  // Render ChordPro
  const renderChordPro = () => {
    if (!chordProData) return <p>Ładowanie tekstu...</p>;
    
    try {
      const normalizedData = normalizeChordPro(chordProData);
      const parser = new ChordSheetJS.ChordProParser();
      let parsedSong = parser.parse(normalizedData);
      
      // Transpozycja (jeśli potrzebna)
      if (transposeDelta !== 0) {
        parsedSong = parsedSong.transpose(transposeDelta);
      }
      
      // Sprawdzenie czy piosenka ma być renderowana w trybie inline (akordy obok)
      const isInline = chordProData.includes('{meta: layout inline}');
      
      // Zmiana na HtmlDivFormatter, żeby łatwiej to układać we flexboxie
      const formatter = new ChordSheetJS.HtmlDivFormatter();
      let html = formatter.format(parsedSong);
      
      if (isInline) {
        html = html.replace('<div class="chord-sheet">', '<div class="chord-sheet inline-chords">');
      }
      
      // Zastosowanie polskiej notacji na wygenerowanym HTML (tylko wewnątrz <div class="chord">...</div>)
      if (usePolishChords) {
        html = html.replace(/<div class="chord">(.*?)<\/div>/g, (match, chordText) => {
          return `<div class="chord">${toPolishChord(chordText)}</div>`;
        });
      }

      // Poprawka na zlewające się akordy w Intro/Outro (gdzie nie ma tekstu piosenki)
      // Dodajemy klasę empty-lyrics do kolumn, które nie mają żadnego tekstu pod spodem
      html = html.replace(/<div class="column">(.*?)<div class="lyrics">\s*<\/div><\/div>/g, '<div class="column empty-lyrics">$1<div class="lyrics"></div></div>');

      return <div className="chord-sheet" style={{ zoom: zoomLevel }} dangerouslySetInnerHTML={{ __html: html }} />;
    } catch (e) {
      return <p>Błąd parsowania pliku ChordPro: {e.message}</p>;
    }
  };

  return (
    <div className="app-container">
      <div className="song-view-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </button>
        <div className="song-view-titles">
          <h2>{song.title}</h2>
          <p>{song.artist}</p>
        </div>
      </div>

      <main>
        {song.type === 'chordpro' && (
          <>
            <div className="transpose-controls" style={{ flexWrap: 'wrap', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ marginRight: '4px' }}>Transpozycja: </span>
                  <button className="transpose-btn" onClick={() => setTransposeDelta(d => d - 1)}><Minus size={16} /></button>
                  <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'center' }}>
                    {transposeDelta > 0 ? `+${transposeDelta}` : transposeDelta}
                  </span>
                  <button className="transpose-btn" onClick={() => setTransposeDelta(d => d + 1)}><Plus size={16} /></button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ marginRight: '4px' }}><Type size={18} /> Zoom: </span>
                  <button className="transpose-btn" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))}><Minus size={16} /></button>
                  <span style={{ fontWeight: 'bold', width: '40px', textAlign: 'center' }}>
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button className="transpose-btn" onClick={() => setZoomLevel(z => Math.min(3, z + 0.1))}><Plus size={16} /></button>
                </div>
              </div>
              
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <input 
                  type="checkbox" 
                  checked={usePolishChords} 
                  onChange={(e) => setUsePolishChords(e.target.checked)} 
                  style={{ marginRight: '6px' }}
                />
                Polska notacja akordów (H, fis, cis)
              </label>
            </div>
            {renderChordPro()}
          </>
        )}

        {song.type === 'pdf' && (
          <div className="pdf-container">
            <iframe src={`${import.meta.env.BASE_URL}songs/${song.type}/${song.file}`} title={song.title} />
          </div>
        )}

        {song.type === 'image' && (
          <div className="image-container" style={{ textAlign: 'center', width: '100%' }}>
            <img 
              src={`${import.meta.env.BASE_URL}songs/${song.type}/${song.file}`} 
              alt={song.title} 
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} 
            />
          </div>
        )}

        {song.type === 'link' && (
          <div className="link-container">
            <ExternalLink size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
            <p>This song is available on an external website.</p>
            <a href={song.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              View chords
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Main App Component ---
function App() {
  const [songs, setSongs] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false); // Domyślnie jasny

  useEffect(() => {
    // Fetch the index.json on app load
    fetch(`${import.meta.env.BASE_URL}songs/index.json`)
      .then(res => res.json())
      .then(data => setSongs(data))
      .catch(err => console.error("Failed to load songs index:", err));
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <Router>
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Przełącz motyw" title="Przełącz motyw">
        {isDarkMode ? <Sun size={24} color="#ff9800" /> : <Moon size={24} color="#666" />}
      </button>
      <Routes>
        <Route path="/" element={<Home songs={songs} />} />
        <Route path="/song/:id" element={<SongView songs={songs} />} />
      </Routes>
    </Router>
  );
}

export default App;
