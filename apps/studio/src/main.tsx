import { mountStudio } from './mount.js';

const container = document.getElementById('root');
if (container === null) throw new Error('Studio host element #root is missing from index.html');
mountStudio(container);
