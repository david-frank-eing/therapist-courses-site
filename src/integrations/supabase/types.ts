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
export type ResourceType = "document" | "presentation" | "pdf" | "other";

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
    };
    CompositeTypes: Record<string, never>;
  };
}
