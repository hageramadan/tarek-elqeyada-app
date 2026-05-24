import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-app-download',
  templateUrl: './app-download.component.html',
  styleUrl: './app-download.component.scss'
})
export class AppDownloadComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sectionContainer', { static: false }) sectionContainer!: ElementRef;
  isVisible = false;
  private observer?: IntersectionObserver;
  private fallbackTimeout?: any;
  private initTimeout?: any;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    // Make visible after a short delay as ultimate fallback
    this.initTimeout = setTimeout(() => {
      if (!this.isVisible) {
        this.isVisible = true;
      }
    }, 300);
  }

  ngAfterViewInit() {
    // Check if section is already in viewport
    setTimeout(() => {
      if (this.sectionContainer && this.sectionContainer.nativeElement) {
        const rect = this.sectionContainer.nativeElement.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight + 200 && rect.bottom > -200;
        
        if (isInViewport) {
          // Section is already visible or close, show it immediately
          if (this.initTimeout) {
            clearTimeout(this.initTimeout);
          }
          this.isVisible = true;
        } else {
          // Section is not visible, set up observer
          this.setupIntersectionObserver();
        }
      } else {
        // Element not found, show immediately
        if (this.initTimeout) {
          clearTimeout(this.initTimeout);
        }
        this.isVisible = true;
      }
    }, 50);
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
    }
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
    }
  }

  setupIntersectionObserver() {
    if (!this.sectionContainer || !this.sectionContainer.nativeElement) {
      // Fallback: if element is not found, make it visible after a delay
      setTimeout(() => {
        this.isVisible = true;
      }, 500);
      return;
    }

    // Check if IntersectionObserver is supported
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback for browsers that don't support IntersectionObserver
      this.isVisible = true;
      return;
    }

    const options = {
      root: null,
      rootMargin: '150px', // Start animation 150px before element enters viewport
      threshold: 0.1 // Trigger when 10% of element is visible
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Clear fallback timeout since observer is working
          if (this.fallbackTimeout) {
            clearTimeout(this.fallbackTimeout);
            this.fallbackTimeout = undefined;
          }
          this.isVisible = true;
        } else {
          // Optional: hide when scrolling back up (comment out if you want it to stay visible)
          // this.isVisible = false;
        }
      });
    }, options);

    try {
      this.observer.observe(this.sectionContainer.nativeElement);
    } catch (error) {
      console.error('Error observing element:', error);
      // Fallback: make visible if observation fails
      this.isVisible = true;
    }
  }

  getFormattedTitle(title: string): SafeHtml {
    const formatted = title.replace('سيارتك', '<span class="highlight-word">سيارتك</span>');
    return this.sanitizer.bypassSecurityTrustHtml(formatted);
  }
}
