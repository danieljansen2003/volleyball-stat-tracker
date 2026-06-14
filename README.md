# Firebase Google Sign-In Setup

1. Go to Firebase Console and create a project.
2. Add a Web App.
3. Copy the Firebase config into firebase-config.js.
4. Enable Authentication > Sign-in method > Google.
5. Create Firestore Database.
6. Use these Firestore rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

7. Redeploy to Vercel.
