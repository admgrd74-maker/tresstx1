# Méthode audio — apprentissage des langues (style « professeur + 2 élèves »)

App d'apprentissage des langues inspirée de la méthode Michel Thomas : l'utilisateur est
le **3ᵉ élève** d'une classe. Un professeur enseigne, deux élèves répondent, et au **bip**
c'est au tour de l'utilisateur de parler. Les mots s'écrivent au **tableau** avec leur
prononciation francisée, au fil de la voix.

> Beta : **français → anglais**. L'architecture est prête pour d'autres langues.

## Structure du projet

```
methode-langue/
├─ app/                 ← l'application élève (ce que voient les utilisateurs)
│  ├─ index.html
│  ├─ styles.css
│  ├─ engine.js         ← moteur : tableau, voix, bip, micro
│  └─ sample-lesson.js  ← leçon par défaut (pour lancer sans serveur)
├─ admin/               ← le panneau de création de leçons (no-code)
│  ├─ index.html
│  ├─ styles.css
│  └─ admin.js
├─ lessons/             ← leçons exportées (.mtlesson = JSON)
│  └─ lecon1.mtlesson
├─ audio/               ← tes fichiers .mp3 (voix ElevenLabs)
│  └─ lecon1/
├─ docs/
│  ├─ GUIDE.md          ← comment créer une leçon
│  └─ FORMAT.md         ← spécification du format de leçon
├─ CLAUDE.md            ← contexte pour Claude Code
└─ package.json
```

## Démarrer

L'app charge des données locales : ouvre-la via un petit serveur (pas en double-clic `file://`).

```bash
# au choix
npx serve .
# ou
python3 -m http.server 8000
```

Puis dans le navigateur :
- **App élève** : http://localhost:8000/app/
- **Panneau admin** : http://localhost:8000/admin/

## Boucle de travail

1. Tu crées tes voix avec ElevenLabs (de ton côté) → tu obtiens des `.mp3`.
2. Tu ouvres l'**admin**, tu écris les répliques, tu charges tes `.mp3`, tu poses les
   mots du tableau et leurs timecodes (bouton « poser au temps courant »).
3. Tu **exportes** un fichier `.mtlesson` (audios inclus).
4. Dans l'**app élève**, tu cliques « Charger une leçon » et tu joues ta leçon.

## Roadmap (idées)

- [ ] Sélecteur de leçons dans l'app (lire le dossier `lessons/`)
- [ ] Synchro tableau sur `timeupdate` de l'audio (précis à la pause près)
- [ ] Clip prénom généré via ElevenLabs à l'inscription
- [ ] Bilan d'erreurs discret (nécessite reconnaissance vocale en arrière-plan)
- [ ] Mode hors-ligne (service worker + cache des audios)
- [ ] Back-office hébergé (stockage des audios, multi-leçons, multi-langues)

Voir `docs/` pour les détails.
