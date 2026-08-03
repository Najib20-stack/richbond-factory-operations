# Application Android Richbond

Le projet natif se trouve dans `android/`. Il utilise Capacitor 8, le package
`ma.richbond.operations`, Android API 24 au minimum et Android API 36 comme
cible.

## Comment une modification arrive dans Android

L'interface Android est la même application React que la version web. Pour une
modification du frontend, modifier les fichiers dans `frontend/`, puis exécuter :

```powershell
npm run android:sync
```

Cette commande compile React et copie le résultat dans le projet Android. Il
faut ensuite relancer l'application depuis Android Studio. Une modification du
backend n'exige pas de synchronisation Android : il suffit de redémarrer ou de
redéployer le serveur, sauf si le contrat de l'API a changé.

Les éléments exclusivement natifs restent dans `android/` : icône, écran de
démarrage, permissions, numéro de version et signature.

## Prérequis

- Node.js 22 ou plus récent ;
- Java 21 ;
- Android Studio ;
- Android SDK Platform 36, Build-Tools 36 et Platform-Tools.

Android Studio crée localement `android/local.properties`. Ce fichier ne doit
pas être ajouté à Git.

## Exécution sur l'émulateur du PC

Le mode Android utilise par défaut `http://10.0.2.2:3000`, l'adresse permettant
à l'émulateur Android d'atteindre le backend de ce PC.

Dans un premier terminal :

```powershell
npm start
```

Dans un second terminal :

```powershell
npm run android:sync
npm run android:open
```

Dans Android Studio, attendre la fin de la synchronisation Gradle, sélectionner
un émulateur dans la barre supérieure, puis cliquer sur **Run**.

Le manifeste `debug` autorise HTTP uniquement pour ce test local. Le manifeste
principal interdit HTTP pour les versions de production.

## Backend de production

Avant la compilation destinée à l'entreprise, définir l'URL HTTPS réelle :

```powershell
$env:VITE_API_URL="https://operations.example.richbond.ma"
npm run android:sync
```

Ne pas compiler une version de production avec `10.0.2.2`, `localhost` ou une
adresse IP locale.

## Version et signature

Les valeurs de version sont configurables sans modifier Gradle :

```powershell
$env:RICHBOND_VERSION_CODE="2"
$env:RICHBOND_VERSION_NAME="1.1.0"
```

Pour une compilation signée en ligne de commande :

```powershell
$env:RICHBOND_KEYSTORE_PATH="C:\chemin-prive\richbond-release.jks"
$env:RICHBOND_KEYSTORE_PASSWORD="mot-de-passe-du-keystore"
$env:RICHBOND_KEY_ALIAS="richbond"
$env:RICHBOND_KEY_PASSWORD="mot-de-passe-de-la-cle"
Set-Location android
.\gradlew.bat clean bundleRelease --no-daemon
```

Les secrets doivent être fournis par un coffre de secrets ou par des variables
d'environnement, jamais dans Git. Le keystore doit être sauvegardé séparément :
sa perte empêcherait la signature des futures mises à jour.

Sur ce PC, les sorties Gradle sont placées hors de OneDrive dans :

```text
%LOCALAPPDATA%\RichbondOperations\android-build\app\outputs\
```

Le bundle destiné à la distribution se trouve dans `bundle/release/`. L'APK de
test se trouve dans `apk/debug/`.

## Contrôle avant diffusion

- vérifier l'icône Richbond et l'écran de démarrage sur l'émulateur ;
- vérifier la connexion au backend HTTPS ;
- exécuter la recette des deux rôles ;
- augmenter `versionCode` à chaque nouvelle diffusion ;
- conserver le `.aab`, le numéro de version et le résultat des tests ;
- faire confirmer par l'entreprise le canal de distribution : MDM, magasin
  privé ou Google Play géré.
