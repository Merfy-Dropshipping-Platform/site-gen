import confetti from 'canvas-confetti';
import { defineSection } from '@merfy/shell';

export default defineSection({ mount() { confetti(); } });
