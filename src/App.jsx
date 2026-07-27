import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import ChordSheetJS from 'chordsheetjs';
import { Search, Flame, Music, FileText, ExternalLink, ArrowLeft, Plus, Minus, Sun, Moon, Type } from 'lucide-react';
import './index.css';

// --- Home Component (Search and List) ---
function Home({ songs }) {
  const [query, setQuery] = useState('');

  // Setup Fuse.js for fuzzy searching
  const fuse = useMemo(() => new Fuse(songs, {
    keys: ['title', 'artist'],
    threshold: 0.3, // 0 is exact, 1 is match anything
  }), [songs]);

  // If there's a query, use fuse search results. Otherwise show all songs.
  const results = query 
    ? fuse.search(query).map(result => result.item) 
    : songs;

  return (
    <div className="app-container">
      <header className="header">
        <h1><Flame size={36} color="#ff9800" /> Śpiewnik zjazdowy | Reunion songbook</h1>
        <div className="search-container">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            className="search-input"
            placeholder="Szukaj piosenki lub wykonawcy..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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
  const [usePolishChords, setUsePolishChords] = useState(true);

  // Funkcja konwertująca akord z formatu międzynarodowego na polski (z małymi literami dla moll, H zamiast B itp.)
  const toPolishChord = (chord) => {
    if (!chord) return chord;
    // Regex do wyciągnięcia: Bazy(A-G), Znaku(b/#), Moll(m), Reszty
    const match = chord.match(/^([A-G])([b#]?)(m?)(.*)$/);
    if (!match) return chord;

    let [_, base, acc, min, rest] = match;

    // H zamiast B
    if (base === 'B' && acc === '') base = 'H';
    else if (base === 'B' && acc === 'b') { base = 'B'; acc = ''; }

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

  useEffect(() => {
    const foundSong = songs.find(s => s.id === id);
    if (foundSong) {
      setSong(foundSong);
      if (foundSong.type === 'chordpro') {
        // Fetch the .pro file
        fetch(`${import.meta.env.BASE_URL}songs/${foundSong.file}`)
          .then(res => res.text())
          .then(text => setChordProData(text))
          .catch(err => console.error("Failed to load song:", err));
      }
    }
  }, [id, songs]);

  if (!song) return <div className="app-container"><p>Ładowanie lub nie znaleziono utworu...</p></div>;

  // Render ChordPro
  const renderChordPro = () => {
    if (!chordProData) return <p>Ładowanie tekstu...</p>;
    
    try {
      const parser = new ChordSheetJS.ChordProParser();
      let parsedSong = parser.parse(chordProData);
      
      // Transpozycja (jeśli potrzebna)
      if (transposeDelta !== 0) {
        parsedSong = parsedSong.transpose(transposeDelta);
      }
      
      // Zmiana na HtmlDivFormatter, żeby łatwiej to układać we flexboxie
      const formatter = new ChordSheetJS.HtmlDivFormatter();
      let html = formatter.format(parsedSong);
      
      // Zastosowanie polskiej notacji na wygenerowanym HTML (tylko wewnątrz <div class="chord">...</div>)
      if (usePolishChords) {
        html = html.replace(/<div class="chord">(.*?)<\/div>/g, (match, chordText) => {
          return `<div class="chord">${toPolishChord(chordText)}</div>`;
        });
      }

      return <div className="chord-sheet" dangerouslySetInnerHTML={{ __html: html }} />;
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ marginRight: '4px' }}>Transpozycja: </span>
                <button className="transpose-btn" onClick={() => setTransposeDelta(d => d - 1)}><Minus size={16} /></button>
                <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'center' }}>
                  {transposeDelta > 0 ? `+${transposeDelta}` : transposeDelta}
                </span>
                <button className="transpose-btn" onClick={() => setTransposeDelta(d => d + 1)}><Plus size={16} /></button>
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
            <iframe src={`${import.meta.env.BASE_URL}songs/${song.file}`} title={song.title} />
          </div>
        )}

        {song.type === 'link' && (
          <div className="link-container">
            <ExternalLink size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
            <p>Ten utwór znajduje się na innej stronie (np. Wywrota.pl).</p>
            <a href={song.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Przejdź do opracowania
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
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Przełącz motyw" title="Przełącz motyw">
        {isDarkMode ? <Sun size={24} color="#ff9800" /> : <Moon size={24} color="#666" />}
      </button>
      <Routes>
        <Route path="/" element={<Home songs={songs} />} />
        <Route path="/song/:id" element={<SongView songs={songs} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
