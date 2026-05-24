import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.component.html',
  styleUrl: './loading-screen.component.scss'
})
export class LoadingScreenComponent implements OnInit, OnDestroy {
  isLoading = true;
  private hasInitialized = false;

  ngOnInit() {
    // Prevent re-initialization if component is recreated
    if (this.hasInitialized) {
      this.isLoading = false;
      document.body.style.overflow = '';
      return;
    }

    // Check if user has seen loading screen before
    const hasSeenLoading = sessionStorage.getItem('hasSeenLoading');
    
    // Also check if there's a modal open - if so, don't show loading screen
    const hasModalOpen = document.querySelector('.modal-overlay') !== null;
    
    if (hasSeenLoading === 'true' || hasModalOpen) {
      // User has seen it before or modal is open, hide immediately
      this.isLoading = false;
      this.hasInitialized = true;
      // Ensure body scroll is unlocked
      document.body.style.overflow = '';
    } else {
      // First time, show loading screen for 2.5 seconds
      setTimeout(() => {
        this.isLoading = false;
        this.hasInitialized = true;
        sessionStorage.setItem('hasSeenLoading', 'true');
        // Ensure body scroll is unlocked after loading screen
        document.body.style.overflow = '';
      }, 2500);
    }
  }

  ngOnDestroy() {
    // Ensure body scroll is unlocked when component is destroyed
    if (this.isLoading) {
      document.body.style.overflow = '';
    }
  }
}
