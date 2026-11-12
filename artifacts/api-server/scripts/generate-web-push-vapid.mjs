import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Add these values to the server's environment secrets. Never commit them.");
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
