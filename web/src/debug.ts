// Outils de vérification visuelle (chargés uniquement avec ?debug) : ouvrent les calques sans rien écrire sur la Bbox.
import { confirm, openSheet } from '@/components/overlays';
import { notify } from '@/components/notify';
import { toast } from '@/lib/data';
import { openPalette } from '@/components/palette';

(window as any).__bp = { confirm, openSheet, notify, toast, openPalette };
