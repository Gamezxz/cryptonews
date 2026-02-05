// Client-side functionality for Crypto News Aggregator

document.addEventListener('DOMContentLoaded', () => {
  // Add smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelector(this.getAttribute('href'))?.scrollIntoView({
        behavior: 'smooth'
      });
    });
  });

  // Update relative time display
  function updateTimeAgo() {
    const timeElements = document.querySelectorAll('time[datetime]');
    timeElements.forEach(el => {
      const datetime = new Date(el.getAttribute('datetime'));
      const now = new Date();
      const diff = now - datetime;

      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      let timeAgo;
      if (minutes < 60) {
        timeAgo = `${minutes}m ago`;
      } else if (hours < 24) {
        timeAgo = `${hours}h ago`;
      } else if (days < 7) {
        timeAgo = `${days}d ago`;
      } else {
        timeAgo = datetime.toLocaleDateString();
      }

      el.textContent = timeAgo;
    });
  }

  // Run immediately and then every minute
  updateTimeAgo();
  setInterval(updateTimeAgo, 60000);

  console.log('Crypto News Aggregator loaded');
});
