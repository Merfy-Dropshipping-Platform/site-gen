import { defineSection } from '@merfy/shell';

export default defineSection({
  mount() {
    throw new Error('сломалась при запуске');
  },
});
