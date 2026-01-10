import { marked } from 'marked';

const renderer = new marked.Renderer();
renderer.image = (...args) => {
  console.log('Args:', args);
  return 'IMAGE_RENDERED';
};

marked.use({ renderer });

console.log(marked.parse('![alt](src "title")'));
