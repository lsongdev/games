import { ready } from 'https://lsong.org/scripts/dom.js';
import { h, render, useState, useEffect } from 'https://lsong.org/scripts/react/index.js';

const GAMES_DATA_URL = 'files/index.json';
const COVER_BASE = 'files/covers/';

const GENRES = {
  action: '动作',
  adventure: '冒险',
  classic: '经典',
  fighting: '格斗',
  platform: '平台',
  puzzle: '益智',
  racing: '竞速',
  rpg: '角色扮演',
  shooter: '射击',
  simulation: '模拟',
  sports: '体育',
  strategy: '策略',
};

const getGenreFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('genre') || '';
};

const GenreFilter = ({ currentGenre, games }) => {
  // Aggregate genres from data, sorted by count descending
  const counts = {};
  for (const g of games) {
    if (g.genre) counts[g.genre] = (counts[g.genre] || 0) + 1;
  }
  const sortedGenres = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const items = [
    h('a', {
      key: 'all',
      className: `genre-chip${!currentGenre ? ' active' : ''}`,
      href: '?genre=',
    }, `全部 (${games.length})`),
  ];

  for (const key of sortedGenres) {
    const count = counts[key];
    const label = GENRES[key] || key;
    items.push(h('a', {
      key,
      className: `genre-chip${currentGenre === key ? ' active' : ''}`,
      href: `?genre=${key}`,
    }, `${label} (${count})`));
  }

  return h('div', { className: 'genre-filter' }, items);
};

const GameCard = ({ game }) => {
  const { id, title, titleCn, year, rating, cover } = game;
  const hasCover = !!cover;
  const coverUrl = hasCover ? `${COVER_BASE}${cover}` : null;
  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';

  return h('a', {
    className: `card game-card${hasCover ? '' : ' no-cover'}`,
    href: `player.html?game=${encodeURIComponent(id)}`,
    'data-game': id,
  },
    hasCover
      ? h('img', { src: coverUrl, alt: title || id, loading: 'lazy' })
      : h('div', { className: 'game-icon' }, '🎮'),
    h('div', { className: 'game-info' },
      title
        ? h('div', { className: 'game-title', title: title }, title)
        : null,
      titleCn
        ? h('div', { className: 'game-title-cn' }, titleCn)
        : null,
      h('div', { className: 'game-meta' },
        year ? h('span', { className: 'game-year' }, year) : null,
        stars ? h('span', { className: 'game-rating' }, stars) : null,
      ),
    ),
  );
};

const GamesGrid = ({ games, genre }) => {
  const filtered = genre ? games.filter(g => g.genre === genre) : games;

  return [
    h(GenreFilter, { currentGenre: genre, games }),
    filtered.length > 0
      ? h('div', { className: 'games-grid' },
          filtered.map(game => h(GameCard, { key: game.id, game })),
        )
      : h('p', { className: 'no-games' }, '该分类下暂无游戏'),
  ];
};

const App = () => {
  const [games, setGames] = useState([]);
  const [genre, setGenre] = useState(getGenreFromURL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(GAMES_DATA_URL)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setGames(data.games || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const onPopState = () => setGenre(getGenreFromURL());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (loading) return h('p', null, 'Loading games...');
  if (error) return h('p', { style: { color: 'red' } }, `Error: ${error}`);

  return h('div', null, [
    h('h2', null, 'Games'),
    h(GamesGrid, { games, genre })
  ]);
};

ready(() => {
  const app = document.getElementById('app');
  render(h(App), app);
});
