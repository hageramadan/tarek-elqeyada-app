import { Component, OnInit } from '@angular/core';
import { SettingsService, Settings } from '../../../services/settings.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit {
  settings: Settings | null = null;
  whatsappUrl: string = 'https://wa.me/966920051022';

  constructor(private settingsService: SettingsService) {}

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        // Generate WhatsApp URL from phone number
        if (settings.phone) {
          this.whatsappUrl = this.settingsService.getWhatsAppUrl(settings.phone);
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        // Keep default WhatsApp URL if settings fail to load
        // The default is already set in the component property
      }
    });
  }

  getGoogleMapsUrl(address: string | null | undefined): string {
    if (!address) {
      return '#';
    }
    return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  }
}
