export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SubscriptionTier = "free" | "basic" | "premium" | "vip";
export type CourseCategory = "business" | "ai" | "clinic_growth";
export type AppRole = "admin" | "moderator" | "user";
export type ResourceType = "video" | "document" | "presentation" | "pdf" | "other";
export type ListingCategory = "clinic_room" | "jobs" | "workshops" | "equipment";
export type ClientStatus = "lead" | "active" | "inactive";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          subscription_tier: SubscriptionTier;
          subscription_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          subscription_tier?: SubscriptionTier;
          subscription_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: AppRole;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: AppRole;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: AppRole;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          category: CourseCategory;
          min_tier: SubscriptionTier;
          duration_minutes: number | null;
          order_index: number | null;
          is_published: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          category: CourseCategory;
          min_tier?: SubscriptionTier;
          duration_minutes?: number | null;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          category?: CourseCategory;
          min_tier?: SubscriptionTier;
          duration_minutes?: number | null;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          course_id: string | null;
          title: string;
          description: string | null;
          video_url: string | null;
          thumbnail_url: string | null;
          duration_minutes: number | null;
          min_tier: SubscriptionTier;
          order_index: number | null;
          is_published: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id?: string | null;
          title: string;
          description?: string | null;
          video_url?: string | null;
          thumbnail_url?: string | null;
          duration_minutes?: number | null;
          min_tier?: SubscriptionTier;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string | null;
          title?: string;
          description?: string | null;
          video_url?: string | null;
          thumbnail_url?: string | null;
          duration_minutes?: number | null;
          min_tier?: SubscriptionTier;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "videos_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          }
        ];
      };
      video_progress: {
        Row: {
          id: string;
          user_id: string;
          video_id: string;
          progress_seconds: number | null;
          completed: boolean | null;
          last_watched_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          video_id: string;
          progress_seconds?: number | null;
          completed?: boolean | null;
          last_watched_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          video_id?: string;
          progress_seconds?: number | null;
          completed?: boolean | null;
          last_watched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_progress_video_id_fkey";
            columns: ["video_id"];
            referencedRelation: "videos";
            referencedColumns: ["id"];
          }
        ];
      };
      course_resources: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          description: string | null;
          type: ResourceType;
          file_path: string | null;
          file_name: string | null;
          url: string | null;
          min_tier: SubscriptionTier;
          order_index: number | null;
          is_published: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          title: string;
          description?: string | null;
          type?: ResourceType;
          file_path?: string | null;
          file_name?: string | null;
          url?: string | null;
          min_tier?: SubscriptionTier;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          description?: string | null;
          type?: ResourceType;
          file_path?: string | null;
          file_name?: string | null;
          url?: string | null;
          min_tier?: SubscriptionTier;
          order_index?: number | null;
          is_published?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_resources_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          }
        ];
      };
      listings: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          category: ListingCategory;
          price: string | null;
          city: string | null;
          image_path: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description: string;
          category: ListingCategory;
          price?: string | null;
          city?: string | null;
          image_path?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          category?: ListingCategory;
          price?: string | null;
          city?: string | null;
          image_path?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          status: ClientStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          status?: ClientStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          status?: ClientStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      site_settings: {
        Row: {
          id: number;
          contact_email: string | null;
          contact_phone: string | null;
          contact_address: string | null;
          social_facebook: string | null;
          social_instagram: string | null;
          social_linkedin: string | null;
          social_youtube: string | null;
          about_title: string | null;
          about_text: string | null;
          hero_badge: string | null;
          hero_title: string | null;
          hero_subtitle: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          contact_email?: string | null;
          contact_phone?: string | null;
          contact_address?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_linkedin?: string | null;
          social_youtube?: string | null;
          about_title?: string | null;
          about_text?: string | null;
          hero_badge?: string | null;
          hero_title?: string | null;
          hero_subtitle?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          contact_email?: string | null;
          contact_phone?: string | null;
          contact_address?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_linkedin?: string | null;
          social_youtube?: string | null;
          about_title?: string | null;
          about_text?: string | null;
          hero_badge?: string | null;
          hero_title?: string | null;
          hero_subtitle?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: AppRole };
        Returns: boolean;
      };
    };
    Enums: {
      subscription_tier: SubscriptionTier;
      course_category: CourseCategory;
      app_role: AppRole;
      resource_type: ResourceType;
      listing_category: ListingCategory;
      client_status: ClientStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
