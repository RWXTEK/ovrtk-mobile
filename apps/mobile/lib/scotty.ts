import { httpsCallable } from "firebase/functions";
import { functions, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export type ChatMsg = { 
  role: "user" | "assistant" | "system"; 
  content: string;
  imageUrl?: string; // Add this
};

// New function to upload images
export async function uploadChatImage(imageUri: string): Promise<string> {
  const response = await fetch(imageUri);
  const blob = await response.blob();
  
  const timestamp = Date.now();
  const storageRef = ref(storage, `chat-images/${timestamp}.jpg`);
  await uploadBytes(storageRef, blob);
  
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

export async function askScotty(messages: ChatMsg[]): Promise<string> {
  const call = httpsCallable(functions, "scottyChat");
  const res = await call({ messages });
  const data = res.data as { reply?: string };
  return data?.reply ?? "";
}