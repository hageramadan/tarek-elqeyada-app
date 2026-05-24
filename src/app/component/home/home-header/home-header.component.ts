import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SliderService, SliderItem } from '../../../services/slider.service';

interface Slide {
  title: string;
  description: string;
  image: string;
  buttonText: string;
}

@Component({
  selector: 'app-home-header',
  templateUrl: './home-header.component.html',
  styleUrl: './home-header.component.scss'
})
export class HomeHeaderComponent implements OnInit, OnDestroy {
  currentSlide = 0;
  private autoSlideInterval: any;
  slides: Slide[] = [];
  isLoading = true;
  private readonly sliderApiOrigin = 'https://dev.tareqalqeyada.sa';

  // Fixed content for all slides
  private readonly fixedContent = {
    title: 'احجز سيارتك بسهولة وفي دقائق',
    description: 'نوفر لك أفضل خدمات تأجير السيارات بأسعار تنافسية وخطوات بسيطة',
    buttonText: 'احجز الان'
  };

  private readonly fallbackImage =
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1920&h=800&fit=crop';

  constructor(
    private sliderService: SliderService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadSliders();
  }

  ngOnDestroy() {
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
    }
  }

  loadSliders() {
    this.sliderService.getSliders().subscribe({
      next: (sliderItems: SliderItem[]) => {
        // Map API images to slides with fixed content
        const mapped = sliderItems.map(item => ({
          title: this.fixedContent.title,
          description: this.fixedContent.description,
          image: this.normalizeSliderImage(item),
          buttonText: this.fixedContent.buttonText
        }));

        // Remove items with missing/invalid images
        this.slides = mapped.filter(s => !!s.image);

        // If no slides from API, use default placeholder
        if (this.slides.length === 0) {
          this.slides = [{
            title: this.fixedContent.title,
            description: this.fixedContent.description,
            image: this.fallbackImage,
            buttonText: this.fixedContent.buttonText
          }];
        }

        this.isLoading = false;
        this.startAutoSlide();
      },
      error: (error) => {
        console.error('Error loading sliders:', error);
        // Fallback to default slide if API fails
        this.slides = [{
          title: this.fixedContent.title,
          description: this.fixedContent.description,
          image: this.fallbackImage,
          buttonText: this.fixedContent.buttonText
        }];
        this.isLoading = false;
        this.startAutoSlide();
      }
    });
  }

  private normalizeSliderImage(item: SliderItem): string {
    const raw = (item.image || item.url || '').trim();
    if (!raw) return '';

    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) return `${this.sliderApiOrigin}${raw}`;
    return `${this.sliderApiOrigin}/${raw}`;
  }

  onSlideImageError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (img && img.src !== this.fallbackImage) {
      img.src = this.fallbackImage;
    }
  }

  startAutoSlide() {
    if (this.slides.length <= 1) return; // Don't auto-slide if only one slide
    
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
    }
    
    this.autoSlideInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  nextSlide() {
    if (this.slides.length === 0) return;
    this.currentSlide = (this.currentSlide + 1) % this.slides.length;
    this.resetAutoSlide();
  }

  prevSlide() {
    if (this.slides.length === 0) return;
    this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
    this.resetAutoSlide();
  }

  goToSlide(index: number) {
    if (index >= 0 && index < this.slides.length) {
      this.currentSlide = index;
      this.resetAutoSlide();
    }
  }

  resetAutoSlide() {
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
    }
    this.startAutoSlide();
  }

  getFormattedTitle(title: string): SafeHtml {
    const formatted = title.replace('سيارتك', '<span class="highlight-word">سيارتك</span>');
    return this.sanitizer.bypassSecurityTrustHtml(formatted);
  }
}
