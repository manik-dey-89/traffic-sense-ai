import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import joblib
import os

# Configuration
LOCATIONS = ['Salt Lake', 'Park Street', 'Howrah', 'New Town', 'Gariahat', 'Behala']
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
HOURS = list(range(24))

def generate_data(n_samples=5000):
    data = []
    for _ in range(n_samples):
        location = np.random.choice(LOCATIONS)
        day = np.random.choice(DAYS)
        hour = np.random.choice(HOURS)
        
        # Traffic logic: 
        # 1. Rush hours (8-10 AM, 5-8 PM) -> High/Medium
        # 2. Weekends -> Lower in office areas (Salt Lake), Higher in Gariahat/Park Street
        # 3. Night (11 PM - 6 AM) -> Low
        
        traffic_score = 0
        
        # Base score by hour
        if 8 <= hour <= 10 or 17 <= hour <= 20:
            traffic_score += 60
        elif 7 <= hour <= 22:
            traffic_score += 30
        else:
            traffic_score += 5
            
        # Location adjustment
        if location in ['Park Street', 'Gariahat']:
            traffic_score += 10
        if location == 'Howrah':
            traffic_score += 15
            
        # Day adjustment
        if day in ['Saturday', 'Sunday']:
            if location in ['Salt Lake', 'New Town']:
                traffic_score -= 15
            else:
                traffic_score += 10
        
        # Add some noise
        traffic_score += np.random.normal(0, 10)
        
        # Classify
        if traffic_score > 70:
            traffic_level = 'High'
        elif traffic_score > 40:
            traffic_level = 'Medium'
        else:
            traffic_level = 'Low'
            
        data.append([location, day, hour, traffic_level])
        
    return pd.DataFrame(data, columns=['location', 'day', 'hour', 'traffic_level'])

def train_model():
    print("Generating synthetic data...")
    df = generate_data()
    
    # Preprocessing
    le_loc = LabelEncoder()
    le_day = LabelEncoder()
    le_level = LabelEncoder()
    
    df['location_enc'] = le_loc.fit_transform(df['location'])
    df['day_enc'] = le_day.fit_transform(df['day'])
    df['traffic_level_enc'] = le_level.fit_transform(df['traffic_level'])
    
    X = df[['location_enc', 'day_enc', 'hour']]
    y = df['traffic_level_enc']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest model...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    accuracy = model.score(X_test, y_test)
    print(f"Model Accuracy: {accuracy:.2f}")
    
    # Save model and encoders
    if not os.path.exists('backend/model'):
        os.makedirs('backend/model')
        
    joblib.dump(model, 'backend/model/traffic_model.pkl')
    joblib.dump(le_loc, 'backend/model/le_loc.pkl')
    joblib.dump(le_day, 'backend/model/le_day.pkl')
    joblib.dump(le_level, 'backend/model/le_level.pkl')
    
    print("Model and encoders saved to backend/model/")

if __name__ == "__main__":
    train_model()
