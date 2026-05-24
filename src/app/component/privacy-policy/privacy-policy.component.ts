import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss']
})
export class PrivacyPolicyComponent implements OnInit {
  currentDate: string = '';

  ngOnInit() {
    // Set current date in Arabic format
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      calendar: 'gregory'
    };
    
    // Format date in Arabic
    const dateFormatter = new Intl.DateTimeFormat('ar-SA', options);
    this.currentDate = dateFormatter.format(today);
  }
}
