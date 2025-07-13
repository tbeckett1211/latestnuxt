<script setup>
const { data } = await useFetch("/api/test");

function closeApp() {
  if (window.electron) {
    window.electron.send("app-quit");
  }
}
</script>

<template>
  <div class="text-4xl text-orange-600">My home page</div>
  <UButton>Click me to learn more</UButton>
  <div>{{ data.message }}</div>

  <br />
  <UButton @click="closeApp">Close App</UButton>
</template>
