import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { ModalService } from '../../../services/modal.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  isLoggedIn = false;
  private checkAuthInterval: any;

  constructor(
    private modalService: ModalService,
    private router: Router
  ) {}

  ngOnInit() {
    this.checkAuthStatus();
    // Check auth status every second to update navbar if user logs in/out
    this.checkAuthInterval = setInterval(() => {
      this.checkAuthStatus();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.checkAuthInterval) {
      clearInterval(this.checkAuthInterval);
    }
  }

  checkAuthStatus() {
    const token = localStorage.getItem('auth_token');
    this.isLoggedIn = !!token;
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMenuIfMobile() {
    if (window.innerWidth <= 768) {
      this.isMenuOpen = false;
      document.body.style.overflow = '';
    }
  }

  openLogin() {
    this.modalService.openModal('login');
  }

  openRegister() {
    this.modalService.openModal('register');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.isMenuOpen) {
      return;
    }
    
    const target = event.target as HTMLElement;
    const menu = document.querySelector('.navbar-menu');
    const toggle = document.querySelector('.navbar-toggle');
    
    if (menu && toggle) {
      if (!menu.contains(target) && !toggle.contains(target)) {
        // Use setTimeout for iOS to prevent immediate closing
        setTimeout(() => {
          this.isMenuOpen = false;
          document.body.style.overflow = '';
        }, 100);
      }
    }
  }
}
