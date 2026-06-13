# CLAUDE.md — contexte projet

Contexte pour Claude Code. Lis ce fichier avant de modifier le projet.

## Ce qu'est le projet
App web d'apprentissage des langues façon « Michel Thomas » : 1 professeur + 2 élèves
(audio pré-enregistré), l'utilisateur est le 3ᵉ élève et répond au **bip**. Les mots
apparaissent au **tableau** avec leur prononciation francisée, synchronisés à la voix.
Beta : français → anglais.

## Décisions déjà prises (ne pas remettre en cause sans demander)
- **Web app** d'abord (mobile plus tard).
- **Hors-ligne** visé à terme (PWA / service worker) — pas encore implémenté.
- Casting fixe : `prof`, `eleve1`, `eleve2`, `moi` (l'utilisateur).
- **Pas de correction en direct** de l'élève (esprit Michel Thomas). Un bilan d'erreurs
  discret est prévu « pour plus tard » (nécessitera de la reconnaissance vocale en fond).
- **Personnalisation par le prénom** : demandé à l'inscription, dit au bip (« À toi, X »).
  En prod : clip prénom généré 1× via ElevenLabs et stocké.
- Les **voix** sont des fichiers ElevenLabs en production ; la synthèse du navigateur
  n'est qu'un **placeholder de démo** (champ `speak`).
- **Pas de clé API ElevenLabs côté navigateur** (sécurité). Toute génération automatique
  d'audio devra passer par un backend — non présent dans ce repo statique.

## Architecture
- `app/` : front statique (HTML/CSS/JS vanilla, sans build, sans framework).
  - `engine.js` lit `window.MT_LESSON` (depuis `sample-lesson.js`) ou un fichier importé.
- `admin/` : éditeur de leçons (HTML/CSS/JS vanilla). Exporte `.mtlesson` (JSON, audios
  en dataURL inclus).
- Format de leçon partagé : voir `docs/FORMAT.md`. **Si tu changes le format, mets à jour
  app + admin + FORMAT.md ensemble.**

## Contraintes techniques
- Pas de localStorage attendu côté artefact d'origine ; ici en repo réel tu PEUX en ajouter.
- Vanilla JS volontaire (simple à maintenir). Demander avant d'introduire un framework/bundler.
- Audio joué via `new Audio(src)` : `src` peut être un chemin (`../audio/...`) ou une dataURL.

## Conventions
- Code et commentaires en **français**.
- Garder app et admin **synchronisés** sur le format de leçon.
- Styles : variables CSS dans `:root`, esthétique « labo de langues vintage »
  (tableau vert, bois, ambre, polices Caveat / Spline Sans / Space Mono).

## Typographie tableau (slot machine) — VALIDÉE, ne pas modifier sans demander
- Police mots EN : **Barlow Condensed 600** (pas Bebas Neue — mauvais rendu sur longues phrases).
- Police mots FR : Fraunces / Syne (voir CSS `.cword-fr`).
- `SLOT_H = 220px` — hauteur fixe de chaque slot.
- Tailles mots EN (`slotFontSize` dans `engine.js`) :
  - ≤9 chars → 72px
  - ≤12 chars → 65px
  - ≤16 chars → 60px
  - >16 chars → 34px (minimum absolu)
  - Rendu : `min(Xpx, Xvw)` — s'adapte automatiquement aux petits écrans (référence 375px).
- Tailles mots FR (`slotFontSizeFr` dans `engine.js`) :
  - ≤9 chars → 24px
  - ≤13 chars → 22px
  - >13 chars → 20px (minimum absolu)
  - Même logique `min(px, vw)` que le EN.

## Design de référence — VALIDÉ, prêt à coder
- Fichier : `designs/design-8-pleinecran.html`
- **Ne pas remettre en cause ce design** sans demander.

### Principes visuels à respecter lors du codage
- Fond global : `#1A2232`. Polices : Bebas Neue (mots EN), Syne (FR + titres), JetBrains Mono (badges/phon), Inter (corps).
- **Tableau = plein écran** — pas de cartes, les `word-block` couvrent toute la surface.
- **Deux états** distincts :
  - **Lecture** (gauche) : 2 mots avec orbes de couleur par type, séparateur blanc `.28`, avatars prof+élève en bas (inactif 44px, actif 64px + halo ambre).
  - **Bip / réponse** (droite) : question ambre en haut, bouton « voir la réponse » (icône œil) centré dessous, panel micro doré avec waveform rayonnante qui déborde du card.
- Badges type : fond coloré `.28` + bordure colorée `.30` + icône SVG.
- Prononciation : couleurs pastel saturées à pleine opacité (lisibles sur fond sombre).
- Panel micro bip : card sombre, waveform ambre 16 barres par côté (masque dégradé effet infini), micro doré, label « moi », boutons « ma réponse / ↺ / Continuer → » (ambre).
- Overlay bottom : dégradé `rgba(18,26,42,.97)`, progression + play/pause.

## Tâches probables à venir
1. Coder `app/` en se basant sur `designs/design-8-pleinecran.html`.
2. Sélecteur de leçons dans l'app (lister/charger les fichiers de `lessons/`).
3. Synchroniser les révélations du tableau sur `audio.timeupdate` (robuste à la pause).
4. Brancher un backend pour la génération ElevenLabs + clip prénom.
5. Service worker pour le hors-ligne.
