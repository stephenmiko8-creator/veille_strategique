# Veille stratégique

Application web en cours de construction pour lancer une analyse stratégique à la demande. Le parcours prévu garde les sources, fait remonter les contradictions pour validation humaine, demande les informations manquantes et relie les signaux aux données financières.

## Connexion Gemini en place

- Interface web servie par un backend Node.js (`server.js`).
- Endpoint `GET /api/status` indiquant si la recherche est configurée, sans exposer de secret.
- Endpoint `POST /api/analyze` qui interroge Gemini avec Grounding Google Search, puis renvoie une première synthèse, les requêtes et références associées.
- La clé `GEMINI_API_KEY` est lue depuis `.env` côté serveur. Elle n’est jamais envoyée au navigateur ni enregistrée dans Git.
- Garde-fou local : au plus cinq recherches par minute.
- Le navigateur affiche les sources comme des pistes à vérifier, pas comme des faits déjà validés.

## Démarrage local

1. Installer Node.js 20 ou supérieur.
2. Copier `.env.example` vers `.env`.
3. Créer une clé Gemini dans [Google AI Studio](https://aistudio.google.com/api-keys), puis renseigner `GEMINI_API_KEY` dans `.env`.
4. Depuis le dossier du projet, lancer `npm start`.
5. Ouvrir `http://localhost:3000`.

Sans clé, l’interface et l’API de statut fonctionnent, mais aucune recherche externe n’est lancée. Aucune requête Gemini n’est automatiquement effectuée au démarrage.

## Limites actuelles

- Gemini lance une recherche Google et propose une première synthèse avec citations ; les documents d’origine doivent être vérifiés avant d’utiliser les chiffres.
- L’extraction structurée des chiffres financiers, détection de conflits, validation humaine et génération complète du rapport restent à construire.
- Les dossiers sont conservés uniquement dans la mémoire de la page et disparaissent au rechargement.
- L’application reste prévue pour un usage local. Avant toute mise en ligne : authentification, base de données, isolation des comptes, protections anti-abus, règles de confidentialité et hébergement sécurisé de la clé.

## Évolution prévue

1. Ajouter extraction et stockage sourcé des indicateurs avec période, devise, périmètre, date et URL.
2. Repérer les contradictions sans choisir automatiquement et obtenir la validation utilisateur.
3. Demander des compléments ciblés, puis exécuter les calculs financiers déterministes.
4. Produire le rapport multidimensionnel avec limites et niveaux de preuve.
5. Ajouter rapports versionnés et mises à jour ponctuelles ; la surveillance récurrente restera opt-in.

