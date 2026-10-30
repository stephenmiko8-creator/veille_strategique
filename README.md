# Veille — prototype d’application web

Prototype d’interface pour le système de veille stratégique défini dans la conversation : une analyse à la demande, sans portefeuille d’entreprises obligatoire, avec validation humaine des divergences et questions ciblées quand les données disponibles ne suffisent pas.

## État actuel

Cette livraison est une maquette front-end autonome. Ouvrir `index.html` dans un navigateur. Elle permet de saisir une entreprise, de créer son dossier dans la session courante et d’afficher le parcours de préparation. Le formulaire ne déclenche pas de recherche web et le prototype n’invente aucune donnée ni conclusion.

## Parcours produit visé

1. L’utilisateur saisit un nom d’entreprise et confirme l’entité juridique.
2. Le service collecte des sources publiques, conserve URL, date de publication, période couverte et périmètre de chaque donnée.
3. Le moteur de rapprochement détecte les écarts sans choisir de valeur à la place de l’utilisateur.
4. L’interface demande une validation explicite en présentant les sources côte à côte. La décision et son auteur sont conservés dans l’audit de l’analyse.
5. Si une donnée manque, le système pose une question précise ou permet un dépôt de pièce. Les sections dépendantes restent signalées comme incomplètes.
6. Le moteur produit une analyse multidimensionnelle reliée aux indicateurs financiers, distingue faits et interprétations et expose limites et confiance.
7. L’utilisateur peut enregistrer une version du rapport et demander une mise à jour ponctuelle. Une surveillance récurrente reste opt-in.

## Étapes techniques suivantes

- Choisir et connecter un fournisseur de recherche web et des sources de référence.
- Ajouter une API d’orchestration qui stocke les analyses, preuves, décisions de validation et versions de rapport.
- Implémenter le modèle de données d’entreprise, métriques sourcées, contradictions, questions de complément et signaux.
- Ajouter l’interface de validation des chiffres et de dépôt d’informations privées.
- Construire les calculs financiers déterministes et la génération de rapport avec citations vérifiables.
- Ajouter authentification, cloisonnement des dossiers et règles de conservation avant toute mise en production.

## Statut GitHub

Le connecteur GitHub a été utilisé pour examiner les dépôts disponibles. Aucun dépôt existant n’a le périmètre adapté ; les dépôts existants n’ont pas été modifiés. Le prototype reste dans l’espace de travail en attendant un dépôt dédié.

