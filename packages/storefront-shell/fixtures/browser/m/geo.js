import { defineSection } from '@merfy/shell';

export default defineSection({
  mount() {
    document.documentElement.dataset.geo = 'ok';
  },
});
