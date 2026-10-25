import { common } from 'lowlight';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import dos from 'highlight.js/lib/languages/dos';
import matlab from 'highlight.js/lib/languages/matlab';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';

export const hljsLanguages = {
  ...common,
  dockerfile,
  dos,
  matlab,
  nginx,
  powershell,
};